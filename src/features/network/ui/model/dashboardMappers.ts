import type {
  ConnectivitySample,
  EndpointLatencyHistoryPoint,
  EndpointStats,
  SpeedSample,
} from "../../model/types";
import { MAX_PLAUSIBLE_MBPS, NA_SUFFIX } from "./chartPresets";
import { statusToLevel } from "./dashboardFormatters";

export type ChartPoint = {
  ts: number;
  [key: string]: string | number | boolean | null;
};

export interface EndpointSeriesItem {
  key: string;
  label: string;
  color: string;
}

export function mapConnectionChartData(
  history: ConnectivitySample[],
): ChartPoint[] {
  return history.map((item) => ({
    ts: item.timestamp,
    statusLevel: statusToLevel(item.status),
    latency: item.probeLatencyMs,
  }));
}

export function mapSpeedChartData(
  speedHistory: SpeedSample[],
  startedAt: number,
): ChartPoint[] {
  if (speedHistory.length === 0) {
    return [
      {
        ts: startedAt,
        download: 0,
        [`download${NA_SUFFIX}`]: true,
      },
    ];
  }

  return speedHistory.map((item) => {
    const hasDownload =
      typeof item.downloadMbps === "number" &&
      item.downloadMbps > 0 &&
      item.downloadMbps < MAX_PLAUSIBLE_MBPS;
    return {
      ts: item.timestamp,
      download: hasDownload ? item.downloadMbps : 0,
      [`download${NA_SUFFIX}`]: !hasDownload,
    };
  });
}

export function mapEndpointHistoryData(
  points: EndpointLatencyHistoryPoint[],
  endpointStats: EndpointStats[],
  startedAt: number,
): ChartPoint[] {
  if (points.length === 0) {
    const fallbackPoint: Record<string, number | boolean> = {};
    for (const item of endpointStats) {
      fallbackPoint[item.endpointId] = 0;
      fallbackPoint[`${item.endpointId}${NA_SUFFIX}`] = true;
    }
    return [
      {
        ts: startedAt,
        ...fallbackPoint,
      },
    ];
  }

  return points.map((point) => {
    const row: Record<string, number | boolean> = {};

    for (const item of endpointStats) {
      const raw = point.values[item.endpointId];
      const hasValue = typeof raw === "number" && Number.isFinite(raw);
      row[item.endpointId] = hasValue ? raw : 0;
      row[`${item.endpointId}${NA_SUFFIX}`] = !hasValue;
    }

    return {
      ts: point.timestamp,
      ...row,
    };
  });
}

export function buildEndpointSeries(
  endpointStats: EndpointStats[],
  colors: string[],
): EndpointSeriesItem[] {
  return endpointStats.map((item, index) => ({
    key: item.endpointId,
    label: item.label,
    color: colors[index % colors.length],
  }));
}
