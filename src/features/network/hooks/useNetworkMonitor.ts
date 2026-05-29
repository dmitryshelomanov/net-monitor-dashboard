import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HISTORY_LIMIT,
  LATENCY_ENDPOINTS,
  PROBE_INTERVALS,
} from "../model/constants";
import type {
  ConnectionStatus,
  EndpointStats,
  NetworkMonitorState,
} from "../model/types";
import {
  appendWithLimit,
  calculateEndpointStats,
  computeQualityScore,
  createEmptyEndpointStats,
  deriveConnectionStatusFromSignals,
  hydrateEndpointStats,
  qualityLabelFromScore,
  summarizeEndpointStats,
} from "../model/utils";
import {
  probeConnection,
  probeLatency,
  probeSpeed,
} from "../services/networkProbes";

type ProbeKind = "connection" | "speed" | "latency";

interface ProbeErrorMap {
  connection: string | null;
  speed: string | null;
  latency: string | null;
}

const initialEndpointStats: EndpointStats[] = LATENCY_ENDPOINTS.map(
  (endpoint) => createEmptyEndpointStats(endpoint),
);

const initialState: NetworkMonitorState = {
  startedAt: Date.now(),
  connectionStatus: navigator.onLine ? "online" : "offline",
  qualityScore: navigator.onLine ? 70 : 0,
  qualityLabel: navigator.onLine ? "warning" : "poor",
  lastUpdatedAt: null,
  connectivityHistory: [],
  speedHistory: [],
  endpointLatencyHistory: [],
  endpointStats: initialEndpointStats,
  latestError: null,
  isPaused: false,
};

function getAverageEndpointLatency(stats: EndpointStats[]): number | null {
  return summarizeEndpointStats(stats).avgLatencyMs;
}

function getFailureRateAverage(stats: EndpointStats[]): number {
  return summarizeEndpointStats(stats).avgFailureRatePercent;
}

function createQualityStatus(
  status: ConnectionStatus,
  endpointStats: EndpointStats[],
  lastDownloadMbps: number | null,
) {
  const avgLatencyMs = getAverageEndpointLatency(endpointStats);
  const failureRatePercent = getFailureRateAverage(endpointStats);
  const qualityScore = computeQualityScore(
    status,
    avgLatencyMs,
    lastDownloadMbps,
    failureRatePercent,
  );
  const qualityLabel = qualityLabelFromScore(qualityScore);

  return {
    qualityScore,
    qualityLabel,
  };
}

function getLatestError(errors: ProbeErrorMap): string | null {
  return errors.connection ?? errors.latency ?? errors.speed ?? null;
}

function applyConnectionProbeResult(
  current: NetworkMonitorState,
  status: ConnectionStatus,
  latencyMs: number | null,
  timestamp: number,
): NetworkMonitorState {
  const quality = createQualityStatus(
    status,
    current.endpointStats,
    current.speedHistory.at(-1)?.downloadMbps ?? null,
  );

  return {
    ...current,
    connectionStatus: status,
    lastUpdatedAt: timestamp,
    connectivityHistory: appendWithLimit(
      current.connectivityHistory,
      {
        timestamp,
        status,
        probeLatencyMs: latencyMs,
      },
      HISTORY_LIMIT,
    ),
    ...quality,
  };
}

function applySpeedProbeResult(
  current: NetworkMonitorState,
  speed: { downloadMbps: number | null; uploadMbps: number | null },
  timestamp: number,
): NetworkMonitorState {
  const nextSpeedHistory = appendWithLimit(
    current.speedHistory,
    {
      timestamp,
      downloadMbps: speed.downloadMbps,
      uploadMbps: speed.uploadMbps,
    },
    HISTORY_LIMIT,
  );

  const quality = createQualityStatus(
    current.connectionStatus,
    current.endpointStats,
    nextSpeedHistory.at(-1)?.downloadMbps ?? null,
  );

  return {
    ...current,
    speedHistory: nextSpeedHistory,
    lastUpdatedAt: timestamp,
    ...quality,
  };
}

function applyLatencyProbeResult(
  current: NetworkMonitorState,
  snapshots: Awaited<ReturnType<typeof probeLatency>>,
  timestamp: number,
): NetworkMonitorState {
  const baseEndpointStats = hydrateEndpointStats(
    current.endpointStats,
    LATENCY_ENDPOINTS,
  );
  const nextEndpointStats = calculateEndpointStats(
    baseEndpointStats,
    snapshots,
  );
  const historyPointValues = snapshots.reduce<Record<string, number | null>>(
    (acc, snapshot) => {
      acc[snapshot.endpointId] = snapshot.latencyMs;
      return acc;
    },
    {},
  );
  const avgSuccessRate =
    nextEndpointStats.reduce(
      (sum, item) => sum + item.sampleSuccessRatePercent,
      0,
    ) / nextEndpointStats.length;

  const nextConnectionStatus = deriveConnectionStatusFromSignals(
    current.connectionStatus,
    avgSuccessRate,
  );
  const quality = createQualityStatus(
    nextConnectionStatus,
    nextEndpointStats,
    current.speedHistory.at(-1)?.downloadMbps ?? null,
  );

  return {
    ...current,
    endpointStats: nextEndpointStats,
    endpointLatencyHistory: appendWithLimit(
      current.endpointLatencyHistory,
      {
        timestamp,
        values: historyPointValues,
      },
      HISTORY_LIMIT,
    ),
    connectionStatus: nextConnectionStatus,
    lastUpdatedAt: timestamp,
    ...quality,
  };
}

export function useNetworkMonitor() {
  const [state, setState] = useState<NetworkMonitorState>(initialState);
  const speedProbeInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const isPausedRef = useRef(false);
  const probeGenerationRef = useRef<Record<ProbeKind, number>>({
    connection: 0,
    speed: 0,
    latency: 0,
  });
  const probeErrorsRef = useRef<ProbeErrorMap>({
    connection: null,
    speed: null,
    latency: null,
  });

  const invalidateProbeResults = useCallback(() => {
    probeGenerationRef.current.connection += 1;
    probeGenerationRef.current.speed += 1;
    probeGenerationRef.current.latency += 1;
  }, []);

  const shouldApplyProbeResult = useCallback(
    (kind: ProbeKind, token: number) => {
      return (
        isMountedRef.current &&
        !isPausedRef.current &&
        probeGenerationRef.current[kind] === token
      );
    },
    [],
  );

  const updateProbeError = useCallback(
    (kind: ProbeKind, message: string | null) => {
      probeErrorsRef.current[kind] = message;
      setState((current) => ({
        ...current,
        latestError: getLatestError(probeErrorsRef.current),
      }));
    },
    [],
  );

  const runConnectionProbe = useCallback(async () => {
    const token = ++probeGenerationRef.current.connection;
    try {
      const result = await probeConnection();
      if (!shouldApplyProbeResult("connection", token)) {
        return;
      }
      updateProbeError("connection", null);
      const timestamp = Date.now();
      setState((current) => {
        return applyConnectionProbeResult(
          current,
          result.status,
          result.latencyMs,
          timestamp,
        );
      });
    } catch {
      if (!shouldApplyProbeResult("connection", token)) {
        return;
      }
      updateProbeError(
        "connection",
        "Не удалось выполнить проверку соединения.",
      );
    }
  }, [shouldApplyProbeResult, updateProbeError]);

  const runSpeedProbe = useCallback(async () => {
    if (speedProbeInFlightRef.current) {
      return;
    }
    const token = ++probeGenerationRef.current.speed;
    speedProbeInFlightRef.current = true;
    try {
      try {
        const speed = await probeSpeed();
        if (!shouldApplyProbeResult("speed", token)) {
          return;
        }
        updateProbeError("speed", null);
        const timestamp = Date.now();
        setState((current) => {
          return applySpeedProbeResult(current, speed, timestamp);
        });
      } catch {
        if (!shouldApplyProbeResult("speed", token)) {
          return;
        }
        updateProbeError("speed", "Не удалось измерить скорость.");
      }
    } finally {
      speedProbeInFlightRef.current = false;
    }
  }, [shouldApplyProbeResult, updateProbeError]);

  const runLatencyProbe = useCallback(async () => {
    const token = ++probeGenerationRef.current.latency;
    try {
      const snapshots = await probeLatency(LATENCY_ENDPOINTS);
      if (!shouldApplyProbeResult("latency", token)) {
        return;
      }
      updateProbeError("latency", null);
      const timestamp = Date.now();
      setState((current) => {
        return applyLatencyProbeResult(current, snapshots, timestamp);
      });
    } catch {
      if (!shouldApplyProbeResult("latency", token)) {
        return;
      }
      updateProbeError("latency", "Не удалось измерить latency endpoint.");
    }
  }, [shouldApplyProbeResult, updateProbeError]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    invalidateProbeResults();
    setState((current) => ({ ...current, isPaused: true }));
  }, [invalidateProbeResults]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    invalidateProbeResults();
    setState((current) => ({ ...current, isPaused: false }));
  }, [invalidateProbeResults]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      invalidateProbeResults();
    };
  }, [invalidateProbeResults]);

  useEffect(() => {
    isPausedRef.current = state.isPaused;
  }, [state.isPaused]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void runConnectionProbe();
      void runSpeedProbe();
      void runLatencyProbe();
    }, 0);

    return () => {
      window.clearTimeout(initialTimer);
    };
  }, [runConnectionProbe, runLatencyProbe, runSpeedProbe]);

  useEffect(() => {
    if (state.isPaused) {
      return undefined;
    }

    const connectionTimer = window.setInterval(() => {
      void runConnectionProbe();
    }, PROBE_INTERVALS.connectionMs);

    const speedTimer = window.setInterval(() => {
      void runSpeedProbe();
    }, PROBE_INTERVALS.speedMs);

    const latencyTimer = window.setInterval(() => {
      void runLatencyProbe();
    }, PROBE_INTERVALS.latencyMs);

    return () => {
      window.clearInterval(connectionTimer);
      window.clearInterval(speedTimer);
      window.clearInterval(latencyTimer);
    };
  }, [runConnectionProbe, runLatencyProbe, runSpeedProbe, state.isPaused]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        pause();
        return;
      }

      resume();
      void runConnectionProbe();
      void runSpeedProbe();
      void runLatencyProbe();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pause, resume, runConnectionProbe, runLatencyProbe, runSpeedProbe]);

  const hasData = useMemo(() => {
    return (
      state.connectivityHistory.length > 0 ||
      state.speedHistory.length > 0 ||
      state.endpointStats.some((item) => item.lastLatencyMs !== null)
    );
  }, [
    state.connectivityHistory.length,
    state.endpointStats,
    state.speedHistory.length,
  ]);

  return {
    state,
    hasData,
    pause,
    resume,
  };
}
