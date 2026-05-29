import type {
  TimelineBandConfig,
  TimelineLineConfig,
  TimelineRightAxisConfig,
} from "../charts/TimelineChart";
import {
  LATENCY_QUALITY_BANDS,
  SPEED_QUALITY_BANDS,
} from "../../model/constants";

export const ENDPOINT_LINE_COLORS = [
  "#a78bfa",
  "#f97316",
  "#22d3ee",
  "#34d399",
  "#f43f5e",
];

export const MAX_PLAUSIBLE_MBPS = 5_000;
export const NA_SUFFIX = "__na";

export const connectionChartRightAxis: TimelineRightAxisConfig = {
  yLabel: "Latency, ms",
  yDomain: ["auto", "auto"],
  yTickFormatter: (value) => `${value}`,
};

export function createConnectionChartLines(
  levelToStatusLabel: (level: number) => string,
): TimelineLineConfig[] {
  return [
    {
      key: "statusLevel",
      label: "Статус подключения",
      color: "#22d3ee",
      valueFormatter: (value) =>
        value === null ? "n/a" : levelToStatusLabel(value),
      yAxisId: "left",
      type: "stepAfter",
    },
    {
      key: "latency",
      label: "Задержка HTTP, мс",
      color: "#f59e0b",
      yAxisId: "right",
      valueFormatter: (value) =>
        value === null ? "n/a" : `${value.toFixed(1)} ms`,
    },
  ];
}

export function createSpeedChartLines(): TimelineLineConfig[] {
  return [
    {
      key: "download",
      label: "Скачивание (raw)",
      color: "#38bdf8",
      type: "linear",
      connectNulls: false,
      valueFormatter: (value) =>
        value === null ? "n/a" : `${value.toFixed(1)} Мбит/с`,
    },
    {
      key: "downloadSmooth",
      label: "Скачивание (MA)",
      color: "#e879f9",
      type: "monotone",
      connectNulls: true,
      strokeDasharray: "6 4",
      valueFormatter: (value) =>
        value === null ? "n/a" : `${value.toFixed(1)} Мбит/с`,
    },
  ];
}

export const speedChartBands: TimelineBandConfig[] = SPEED_QUALITY_BANDS.map(
  (band) => ({
    from: band.min,
    to: band.max,
    color: band.color,
    label: band.label,
  }),
);

export const latencyChartBands: TimelineBandConfig[] = LATENCY_QUALITY_BANDS.map(
  (band) => ({
    from: band.min,
    to: band.max,
    color: band.color,
    label: band.label,
  }),
);
