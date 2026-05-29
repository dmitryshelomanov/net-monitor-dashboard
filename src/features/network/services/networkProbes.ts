import {
  CONNECTIVITY_PROBES,
  PROBE_TIMEOUTS,
  SPEED_TEST_CONFIG,
} from "../model/constants";
import type {
  ConnectionProbeResult,
  EndpointConfig,
  EndpointLatencySnapshot,
  SpeedMeasurementSource,
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

function withProbeAttempt(url: string, attempt: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}attempt=${attempt}`;
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

type DownloadSample = {
  downloadMbps: number;
  durationMs: number;
  bytes: number;
  source: Extract<
    SpeedMeasurementSource,
    "resource_timing" | "stream_fallback"
  >;
  isApproximate: boolean;
  usedCompressedTransfer: boolean | null;
};

function calculateMbps(bytes: number, durationMs: number): number | null {
  if (
    !Number.isFinite(bytes) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }
  if (durationMs < SPEED_TEST_CONFIG.minDurationForReliableSampleMs) {
    return null;
  }
  const seconds = durationMs / 1000;
  const mbps = (bytes * 8) / seconds / 1_000_000;
  if (mbps > SPEED_TEST_CONFIG.maxPlausibleMbps) {
    return null;
  }
  return toRounded(mbps, 2);
}

function extractTimingSample(
  entry: PerformanceResourceTiming,
): DownloadSample | null {
  const transferBytes =
    entry.transferSize > 0
      ? entry.transferSize
      : entry.encodedBodySize > 0
        ? entry.encodedBodySize
        : 0;

  if (transferBytes < SPEED_TEST_CONFIG.minBytesForValidSample) {
    return null;
  }

  const durationMs = entry.duration;
  const downloadMbps = calculateMbps(transferBytes, durationMs);
  if (downloadMbps === null) {
    return null;
  }

  const hasCompressionSignal =
    entry.decodedBodySize > 0 &&
    entry.encodedBodySize > 0 &&
    entry.decodedBodySize / entry.encodedBodySize >=
      SPEED_TEST_CONFIG.compressionGapRatio;

  return {
    downloadMbps,
    durationMs: toRounded(durationMs, 1) ?? durationMs,
    bytes: transferBytes,
    source: "resource_timing",
    isApproximate: hasCompressionSignal || entry.transferSize === 0,
    usedCompressedTransfer: hasCompressionSignal,
  };
}

async function getTimingEntryByName(
  resourceUrl: string,
): Promise<PerformanceResourceTiming | null> {
  for (let retry = 0; retry < 3; retry += 1) {
    const entries = performance.getEntriesByName(resourceUrl, "resource");
    const last = entries.at(-1);
    if (last instanceof PerformanceResourceTiming) {
      return last;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return null;
}

async function measureStreamSample(
  response: Response,
  startedAt: number,
): Promise<DownloadSample | null> {
  if (!response.body) {
    const blob = await response.blob();
    const durationMs = nowMs() - startedAt;
    const downloadMbps = calculateMbps(blob.size, durationMs);
    if (
      blob.size < SPEED_TEST_CONFIG.minBytesForValidSample ||
      downloadMbps === null
    ) {
      return null;
    }
    return {
      downloadMbps,
      durationMs: toRounded(durationMs, 1) ?? durationMs,
      bytes: blob.size,
      source: "stream_fallback",
      isApproximate: false,
      usedCompressedTransfer: null,
    };
  }

  const reader = response.body.getReader();
  let bytesReceived = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytesReceived += value.byteLength;
    const elapsedMs = nowMs() - startedAt;
    if (
      bytesReceived >= SPEED_TEST_CONFIG.minBytesForValidSample &&
      elapsedMs >= SPEED_TEST_CONFIG.targetMinDurationMs
    ) {
      await reader.cancel();
      break;
    }
  }

  const durationMs = nowMs() - startedAt;
  const downloadMbps = calculateMbps(bytesReceived, durationMs);
  if (
    bytesReceived < SPEED_TEST_CONFIG.minBytesForValidSample ||
    downloadMbps === null
  ) {
    return null;
  }

  return {
    downloadMbps,
    durationMs: toRounded(durationMs, 1) ?? durationMs,
    bytes: bytesReceived,
    source: "stream_fallback",
    isApproximate: false,
    usedCompressedTransfer: null,
  };
}

async function measureSingleDownloadSample(
  url: string,
  attempt: number,
): Promise<DownloadSample | null> {
  const probeUrl = withProbeAttempt(withTimestamp(url), attempt);
  const startedAt = nowMs();
  try {
    const response = await fetchWithTimeout(
      probeUrl,
      { cache: "no-store" },
      SPEED_TEST_CONFIG.timeoutMs,
    );
    if (!response.ok) {
      return null;
    }

    const streamSample = await measureStreamSample(response, startedAt);
    const timingEntry = await getTimingEntryByName(probeUrl);
    if (timingEntry) {
      const timingSample = extractTimingSample(timingEntry);
      if (timingSample) {
        if (
          streamSample &&
          timingSample.downloadMbps > streamSample.downloadMbps * 2
        ) {
          return streamSample;
        }
        return timingSample;
      }
    }
    return streamSample;
  } catch {
    return null;
  }
}

function pickMedianSample(samples: DownloadSample[]): DownloadSample | null {
  if (samples.length === 0) {
    return null;
  }
  const sorted = [...samples].sort((a, b) => a.downloadMbps - b.downloadMbps);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measureDownloadSample(): Promise<DownloadSample | null> {
  const candidates = getDownloadCandidates();
  const collected: DownloadSample[] = [];
  const warmupCollected: DownloadSample[] = [];
  const totalAttempts = Math.max(1, SPEED_TEST_CONFIG.maxAttempts);
  const warmups = Math.max(0, SPEED_TEST_CONFIG.warmupAttempts);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const url = candidates[attempt % candidates.length];
    const sample = await measureSingleDownloadSample(url, attempt);
    if (!sample) {
      continue;
    }

    if (attempt < warmups) {
      warmupCollected.push(sample);
      continue;
    }

    collected.push(sample);

    if (
      sample.durationMs >= SPEED_TEST_CONFIG.targetMinDurationMs &&
      sample.durationMs <= SPEED_TEST_CONFIG.targetMaxDurationMs &&
      collected.length >= 2
    ) {
      break;
    }
  }

  if (collected.length > 0) {
    return pickMedianSample(collected);
  }
  return pickMedianSample(warmupCollected);
}

export async function probeSpeed(): Promise<SpeedProbeResult> {
  const sample = await measureDownloadSample();
  const estimatedMbps = sample ? null : getEstimatedDownlinkMbps();
  const downloadMbps = sample?.downloadMbps ?? estimatedMbps;
  const source: SpeedMeasurementSource = sample
    ? sample.source
    : estimatedMbps !== null
      ? "navigator_estimate"
      : "unavailable";

  return {
    downloadMbps,
    uploadMbps: null,
    measurementSource: source,
    sampleDurationMs: sample?.durationMs ?? null,
    sampleBytes: sample?.bytes ?? null,
    isApproximate: sample?.isApproximate ?? source !== "resource_timing",
    usedCompressedTransfer: sample?.usedCompressedTransfer ?? null,
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
