import type {
  ConnectivitySample,
  EndpointLatencyHistoryPoint,
  EndpointStats,
  SpeedSample,
} from "../../model/types";
import { computeMovingAverage, toRounded } from "../../model/utils";
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

  const normalized = speedHistory.map((item) => {
    const hasDownload =
      typeof item.downloadMbps === "number" &&
      item.downloadMbps > 0 &&
      item.downloadMbps < MAX_PLAUSIBLE_MBPS;
    return {
      ts: item.timestamp,
      value: hasDownload ? item.downloadMbps : null,
    };
  });

  const withAverage = computeMovingAverage(normalized, 4);
  return withAverage.map((item) => ({
    ts: item.ts,
    download: item.value ?? 0,
    downloadSmooth: item.smooth,
    [`download${NA_SUFFIX}`]: item.value === null,
  }));
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
    fallbackPoint.avgLatency = 0;
    fallbackPoint[`avgLatency${NA_SUFFIX}`] = true;
    fallbackPoint.avgLatencySmooth = 0;
    fallbackPoint[`avgLatencySmooth${NA_SUFFIX}`] = true;
    return [
      {
        ts: startedAt,
        ...fallbackPoint,
      },
    ];
  }

  const rawRows: Array<ChartPoint & { avgLatency: number | null }> = points.map(
    (point) => {
      const row: Record<string, number | boolean | null> = {};
      const endpointValues: number[] = [];

      for (const item of endpointStats) {
        const raw = point.values[item.endpointId];
        const hasValue = typeof raw === "number" && Number.isFinite(raw);
        row[item.endpointId] = hasValue ? raw : 0;
        row[`${item.endpointId}${NA_SUFFIX}`] = !hasValue;
        if (hasValue) {
          endpointValues.push(raw);
        }
      }

      const avgLatency =
        endpointValues.length > 0
          ? toRounded(
              endpointValues.reduce((sum, value) => sum + value, 0) /
                endpointValues.length,
              1,
            )
          : null;
      row.avgLatency = avgLatency;
      row[`avgLatency${NA_SUFFIX}`] = avgLatency === null;

      return {
        ts: point.timestamp,
        ...row,
        avgLatency,
      };
    },
  );

  const withSmoothing = computeMovingAverage(
    rawRows.map((row) => ({
      ts: Number(row.ts),
      value: typeof row.avgLatency === "number" ? row.avgLatency : null,
    })),
    4,
  );

  return rawRows.map((row, index) => ({
    ...row,
    avgLatencySmooth: withSmoothing[index]?.smooth ?? null,
    [`avgLatencySmooth${NA_SUFFIX}`]: withSmoothing[index]?.smooth === null,
  }));
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
