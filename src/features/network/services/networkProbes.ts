import {
  CONNECTIVITY_PROBES,
  PROBE_TIMEOUTS,
  SPEED_TEST_CONFIG,
} from "../model/constants";
import type {
  ConnectionProbeResult,
  EndpointConfig,
  EndpointLatencySnapshot,
  SpeedProbeResult,
} from "../model/types";
import { toRounded } from "../model/utils";

let nextDownloadPathIndex = 0;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function nowMs() {
  return performance.now();
}

function getEstimatedDownlinkMbps(): number | null {
  type NavigatorConnection = {
    downlink?: number;
    effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  };

  const connection = (
    navigator as Navigator & { connection?: NavigatorConnection }
  ).connection;

  if (
    typeof connection?.downlink === "number" &&
    Number.isFinite(connection.downlink)
  ) {
    return toRounded(connection.downlink, 2);
  }

  if (connection?.effectiveType) {
    const byType: Record<
      NonNullable<NavigatorConnection["effectiveType"]>,
      number
    > = {
      "slow-2g": 0.05,
      "2g": 0.3,
      "3g": 1.5,
      "4g": 10,
    };
    return toRounded(byType[connection.effectiveType], 2);
  }

  return null;
}

function withTimestamp(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function getDownloadCandidates(): string[] {
  const paths = SPEED_TEST_CONFIG.localDownloadPaths;
  if (paths.length <= 1) {
    return paths;
  }

  const startIndex = nextDownloadPathIndex % paths.length;
  nextDownloadPathIndex += 1;

  const firstPart = paths.slice(startIndex);
  const secondPart = paths.slice(0, startIndex);
  return [...firstPart, ...secondPart];
}

async function measureReachabilityLatency(
  url: string,
  timeoutMs: number,
): Promise<number | null> {
  const start = nowMs();
  try {
    await fetchWithTimeout(
      `${url}?ts=${Date.now()}`,
      {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
      },
      timeoutMs,
    );
    return toRounded(nowMs() - start, 1);
  } catch {
    return null;
  }
}

export async function probeConnection(): Promise<ConnectionProbeResult> {
  if (!navigator.onLine) {
    return {
      status: "offline",
      latencyMs: null,
    };
  }

  for (const probeUrl of CONNECTIVITY_PROBES) {
    const latencyMs = await measureReachabilityLatency(
      probeUrl,
      PROBE_TIMEOUTS.connectivityMs,
    );
    if (latencyMs !== null) {
      return {
        status: "online",
        latencyMs,
      };
    }
  }

  return {
    status: "degraded",
    latencyMs: null,
  };
}

async function measureDownloadMbps(): Promise<number | null> {
  for (const downloadUrl of getDownloadCandidates()) {
    const start = nowMs();
    try {
      const response = await fetchWithTimeout(
        withTimestamp(downloadUrl),
        {
          cache: "no-store",
        },
        SPEED_TEST_CONFIG.timeoutMs,
      );

      if (!response.ok) {
        continue;
      }

      if (!response.body) {
        const blob = await response.blob();
        if (blob.size < SPEED_TEST_CONFIG.minBytesForValidSample) {
          continue;
        }
        const seconds = (nowMs() - start) / 1000;
        if (seconds <= 0) {
          continue;
        }
        const mbps = (blob.size * 8) / seconds / 1_000_000;
        return toRounded(mbps, 2);
      }

      const reader = response.body.getReader();
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        bytesReceived += value.byteLength;

        if (bytesReceived >= SPEED_TEST_CONFIG.downloadSampleBytes) {
          await reader.cancel();
          break;
        }
      }

      if (bytesReceived < SPEED_TEST_CONFIG.minBytesForValidSample) {
        continue;
      }

      const seconds = (nowMs() - start) / 1000;
      if (seconds <= 0) {
        continue;
      }

      const mbps = (bytesReceived * 8) / seconds / 1_000_000;
      return toRounded(mbps, 2);
    } catch {
      // Try next candidate URL.
    }
  }

  return getEstimatedDownlinkMbps();
}

export async function probeSpeed(): Promise<SpeedProbeResult> {
  const downloadMbps = await measureDownloadMbps();
  return {
    downloadMbps,
    uploadMbps: null,
  };
}

async function measureEndpointLatency(
  endpoint: EndpointConfig,
): Promise<EndpointLatencySnapshot> {
  const startedAt = nowMs();
  try {
    await fetchWithTimeout(
      `${endpoint.url}?ts=${Date.now()}`,
      {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
      },
      PROBE_TIMEOUTS.endpointLatencyMs,
    );

    return {
      endpointId: endpoint.id,
      latencyMs: toRounded(nowMs() - startedAt, 1),
      isSuccess: true,
      timestamp: Date.now(),
    };
  } catch {
    return {
      endpointId: endpoint.id,
      latencyMs: null,
      isSuccess: false,
      timestamp: Date.now(),
    };
  }
}

export async function probeLatency(
  endpoints: EndpointConfig[],
): Promise<EndpointLatencySnapshot[]> {
  return Promise.all(
    endpoints.map((endpoint) => measureEndpointLatency(endpoint)),
  );
}
