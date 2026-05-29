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
  downloadSampleBytes: 512_000,
  timeoutMs: 12_000,
  minBytesForValidSample: 100_000,
};
