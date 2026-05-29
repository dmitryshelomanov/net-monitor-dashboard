import type {
  ConnectionStatus,
  ConnectivitySample,
  DegradationEvent,
  EndpointConfig,
  EndpointLatencyHistoryPoint,
  EndpointLatencySnapshot,
  EndpointStats,
  NetworkMonitorState,
  PeriodMetricSummary,
  ReliabilitySummary,
  SpeedSample,
} from "./types";
import { RANGE_WINDOWS_MS } from "./constants";

export function appendWithLimit<T>(
  items: T[] | undefined | null,
  nextItem: T,
  max: number,
): T[] {
  const safeItems = Array.isArray(items) ? items : [];
  const updated = [...safeItems, nextItem];
  if (updated.length <= max) {
    return updated;
  }
  return updated.slice(updated.length - max);
}

export function toRounded(value: number | null, digits = 2): number | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

export function calculateEndpointStats(
  baseStats: EndpointStats[],
  snapshots: EndpointLatencySnapshot[],
): EndpointStats[] {
  const groupedByEndpoint = new Map<string, EndpointLatencySnapshot[]>();

  for (const snapshot of snapshots) {
    const list = groupedByEndpoint.get(snapshot.endpointId) ?? [];
    list.push(snapshot);
    groupedByEndpoint.set(snapshot.endpointId, list);
  }

  return baseStats.map((current) => {
    const endpointSnapshots = groupedByEndpoint.get(current.endpointId);
    if (!endpointSnapshots || endpointSnapshots.length === 0) {
      return current;
    }

    const successes = endpointSnapshots.filter(
      (item) => item.isSuccess && item.latencyMs !== null,
    );
    const successCount = successes.length;
    const totalCount = endpointSnapshots.length;
    const last = endpointSnapshots[endpointSnapshots.length - 1];

    return {
      ...current,
      lastLatencyMs: last.latencyMs,
      sampleFailureRatePercent:
        toRounded(((totalCount - successCount) / totalCount) * 100, 1) ?? 0,
      sampleSuccessRatePercent:
        toRounded((successCount / totalCount) * 100, 1) ?? 0,
      lastUpdatedAt: last.timestamp,
    };
  });
}

export function createEmptyEndpointStats(
  endpoint: EndpointConfig,
): EndpointStats {
  return {
    endpointId: endpoint.id,
    label: endpoint.label,
    url: endpoint.url,
    lastLatencyMs: null,
    sampleFailureRatePercent: 0,
    sampleSuccessRatePercent: 0,
    lastUpdatedAt: null,
  };
}

export function hydrateEndpointStats(
  currentStats: EndpointStats[],
  endpoints: EndpointConfig[],
): EndpointStats[] {
  const byId = new Map(currentStats.map((item) => [item.endpointId, item]));

  return endpoints.map((endpoint) => {
    const existing = byId.get(endpoint.id);
    if (!existing) {
      return createEmptyEndpointStats(endpoint);
    }

    return {
      ...existing,
      label: endpoint.label,
      url: endpoint.url,
    };
  });
}

export function summarizeEndpointStats(stats: EndpointStats[]): {
  avgLatencyMs: number | null;
  avgFailureRatePercent: number;
} {
  const latencyValues = stats
    .map((item) => item.lastLatencyMs)
    .filter((value): value is number => value !== null);
  const avgLatencyMs =
    latencyValues.length === 0
      ? null
      : latencyValues.reduce((sum, value) => sum + value, 0) /
        latencyValues.length;

  const avgFailureRatePercent =
    stats.length === 0
      ? 0
      : stats.reduce((sum, item) => sum + item.sampleFailureRatePercent, 0) /
        stats.length;

  return {
    avgLatencyMs: toRounded(avgLatencyMs, 1),
    avgFailureRatePercent: toRounded(avgFailureRatePercent, 1) ?? 0,
  };
}

export function deriveConnectionStatusFromSignals(
  current: ConnectionStatus,
  latencySuccessRatePercent: number | null,
): ConnectionStatus {
  if (current === "offline") {
    return "offline";
  }

  if (
    typeof latencySuccessRatePercent === "number" &&
    Number.isFinite(latencySuccessRatePercent) &&
    latencySuccessRatePercent < 40
  ) {
    return "degraded";
  }

  return current;
}

export function computeQualityScore(
  status: ConnectionStatus,
  avgPingMs: number | null,
  downloadMbps: number | null,
  failureRatePercent: number,
): NetworkMonitorState["qualityScore"] {
  if (status === "offline") {
    return 0;
  }

  let score = 100;

  if (status === "degraded") {
    score -= 25;
  }

  if (avgPingMs !== null) {
    if (avgPingMs > 220) {
      score -= 30;
    } else if (avgPingMs > 120) {
      score -= 20;
    } else if (avgPingMs > 80) {
      score -= 10;
    }
  }

  if (downloadMbps !== null) {
    if (downloadMbps < 2) {
      score -= 30;
    } else if (downloadMbps < 8) {
      score -= 20;
    } else if (downloadMbps < 20) {
      score -= 10;
    }
  }

  if (failureRatePercent > 10) {
    score -= 20;
  } else if (failureRatePercent > 3) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function qualityLabelFromScore(
  score: number,
): NetworkMonitorState["qualityLabel"] {
  if (score >= 85) {
    return "excellent";
  }
  if (score >= 65) {
    return "good";
  }
  if (score >= 40) {
    return "warning";
  }
  return "poor";
}

export function summarizeNumericSeries(values: number[]): PeriodMetricSummary {
  if (values.length === 0) {
    return { avg: null, min: null, max: null, p95: null };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const percentileIndex = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p95 = sorted[percentileIndex];

  return {
    avg: toRounded(avg, 1),
    min: toRounded(min, 1),
    max: toRounded(max, 1),
    p95: toRounded(p95, 1),
  };
}

export function filterByRange<T extends { timestamp: number }>(
  items: T[],
  range: keyof typeof RANGE_WINDOWS_MS,
  now = Date.now(),
): T[] {
  const cutoff = now - RANGE_WINDOWS_MS[range];
  return items.filter((item) => item.timestamp >= cutoff);
}

export function collectLatencySamples(
  points: EndpointLatencyHistoryPoint[],
): number[] {
  return points.flatMap((point) =>
    Object.values(point.values).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ),
  );
}

export function summarizeRangeMetrics(
  speedHistory: SpeedSample[],
  endpointLatencyHistory: EndpointLatencyHistoryPoint[],
): {
  download: PeriodMetricSummary;
  latency: PeriodMetricSummary;
} {
  const downloadValues = speedHistory
    .map((item) => item.downloadMbps)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const latencyValues = collectLatencySamples(endpointLatencyHistory);

  return {
    download: summarizeNumericSeries(downloadValues),
    latency: summarizeNumericSeries(latencyValues),
  };
}

export function reconcileDegradationEvents(
  events: DegradationEvent[],
  previousStatus: ConnectionStatus,
  nextStatus: ConnectionStatus,
  timestamp: number,
): DegradationEvent[] {
  const nextEvents = [...events];
  const activeEvent = nextEvents.findLast((item) => item.endedAt === null) ?? null;
  const prevBad = previousStatus !== "online";
  const nextBad = nextStatus !== "online";

  if (!nextBad) {
    if (activeEvent) {
      activeEvent.endedAt = timestamp;
    }
    return nextEvents;
  }

  const nextBadStatus = nextStatus as Exclude<ConnectionStatus, "online">;
  if (!prevBad || !activeEvent) {
    nextEvents.push({
      id: `${nextBadStatus}-${timestamp}`,
      status: nextBadStatus,
      startedAt: timestamp,
      endedAt: null,
    });
    return nextEvents;
  }

  if (activeEvent.status !== nextBadStatus) {
    activeEvent.endedAt = timestamp;
    nextEvents.push({
      id: `${nextBadStatus}-${timestamp}`,
      status: nextBadStatus,
      startedAt: timestamp,
      endedAt: null,
    });
  }

  return nextEvents;
}

export function computeReliabilitySummary(
  connectivityHistory: ConnectivitySample[],
): ReliabilitySummary {
  if (connectivityHistory.length < 2) {
    return {
      uptimePercent: null,
      disconnectCount: 0,
      longestOutageMs: 0,
    };
  }

  const sorted = [...connectivityHistory].sort((a, b) => a.timestamp - b.timestamp);
  const firstTs = sorted[0].timestamp;
  const lastTs = sorted[sorted.length - 1].timestamp;
  const totalSpan = Math.max(0, lastTs - firstTs);
  if (totalSpan <= 0) {
    return { uptimePercent: null, disconnectCount: 0, longestOutageMs: 0 };
  }

  let onlineDuration = 0;
  let disconnectCount = 0;
  let longestOutageMs = 0;
  let currentOutageStartedAt: number | null = null;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const segment = Math.max(0, next.timestamp - current.timestamp);
    if (current.status === "online") {
      onlineDuration += segment;
    } else {
      if (currentOutageStartedAt === null) {
        currentOutageStartedAt = current.timestamp;
        disconnectCount += 1;
      }
    }

    if (current.status !== "online" && next.status === "online") {
      const outageDuration = Math.max(0, next.timestamp - (currentOutageStartedAt ?? current.timestamp));
      longestOutageMs = Math.max(longestOutageMs, outageDuration);
      currentOutageStartedAt = null;
    }
  }

  const last = sorted[sorted.length - 1];
  if (last.status !== "online") {
    const startedAt = currentOutageStartedAt ?? last.timestamp;
    longestOutageMs = Math.max(longestOutageMs, Math.max(0, Date.now() - startedAt));
  }

  return {
    uptimePercent: toRounded((onlineDuration / totalSpan) * 100, 1),
    disconnectCount,
    longestOutageMs,
  };
}

export function computeMovingAverage(
  points: Array<{ ts: number; value: number | null }>,
  windowSize: number,
): Array<{ ts: number; value: number | null; smooth: number | null }> {
  const queue: number[] = [];
  let sum = 0;

  return points.map((point) => {
    if (typeof point.value === "number" && Number.isFinite(point.value)) {
      queue.push(point.value);
      sum += point.value;
      if (queue.length > windowSize) {
        const removed = queue.shift();
        if (typeof removed === "number") {
          sum -= removed;
        }
      }
      return {
        ts: point.ts,
        value: point.value,
        smooth: toRounded(sum / queue.length, 2),
      };
    }

    return {
      ts: point.ts,
      value: point.value,
      smooth: null,
    };
  });
}
