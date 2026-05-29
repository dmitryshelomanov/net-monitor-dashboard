import type {
  ConnectionStatus,
  EndpointConfig,
  EndpointLatencySnapshot,
  EndpointStats,
  NetworkMonitorState,
} from "./types";

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
