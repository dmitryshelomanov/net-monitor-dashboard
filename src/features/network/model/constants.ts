import type { EndpointConfig } from "./types";

export const CONNECTIVITY_PROBES: string[] = [
  "https://www.gstatic.com/generate_204",
  "https://ya.ru",
];

export const LATENCY_ENDPOINTS: EndpointConfig[] = [
  {
    id: "yandex",
    label: "Яндекс",
    url: "https://ya.ru",
  },
  {
    id: "hh",
    label: "HH.ru",
    url: "https://hh.ru/",
  },
  {
    id: "avito",
    label: "Авито",
    url: "https://www.avito.ru/",
  },
];

export const HISTORY_LIMIT = 120;

export const RANGE_WINDOWS_MS = {
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

export const MONITORING_RANGES = [
  { key: "5m", label: "5m" },
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
] as const;

export const DEGRADATION_ALERT = {
  sustainedDurationMs: 2 * 60 * 1000,
  cooldownMs: 3 * 60 * 1000,
} as const;

export const LATENCY_QUALITY_BANDS = [
  { min: 0, max: 80, label: "Хорошо", color: "rgba(52, 211, 153, 0.12)" },
  { min: 80, max: 150, label: "Warning", color: "rgba(250, 204, 21, 0.12)" },
  { min: 150, max: 1_000, label: "Плохо", color: "rgba(248, 113, 113, 0.12)" },
] as const;

export const SPEED_QUALITY_BANDS = [
  { min: 0, max: 8, label: "Плохо", color: "rgba(248, 113, 113, 0.12)" },
  {
    min: 8,
    max: 20,
    label: "Warning",
    color: "rgba(250, 204, 21, 0.12)",
  },
  { min: 20, max: 500, label: "Хорошо", color: "rgba(52, 211, 153, 0.12)" },
] as const;

export const PROBE_INTERVALS = {
  connectionMs: 4_000,
  speedMs: 30_000,
  latencyMs: 8_000,
} as const;

export const PROBE_TIMEOUTS = {
  connectivityMs: 5_000,
  endpointLatencyMs: 6_000,
} as const;

export const SPEED_TEST_CONFIG = {
  localDownloadPaths: ["/speed-test/1mb.bin", "/speed-test/10mb.bin"],
  timeoutMs: 12_000,
  minBytesForValidSample: 100_000,
  warmupAttempts: 0,
  maxAttempts: 4,
  targetMinDurationMs: 800,
  targetMaxDurationMs: 3_000,
  compressionGapRatio: 1.2,
  maxPlausibleMbps: 5_000,
};
