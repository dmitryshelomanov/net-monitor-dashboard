import { useMemo } from "react";
import type { TimelinePoint } from "./TimelineChart";
import { TimelineChart } from "./TimelineChart";
import { latencyChartBands } from "../model/chartPresets";

interface EndpointHealthChartProps {
  data: TimelinePoint[];
  series: Array<{
    key: string;
    label: string;
    color: string;
  }>;
}

export function EndpointHealthChart({
  data,
  series,
}: EndpointHealthChartProps) {
  const lines = useMemo(() => {
    return [
      ...series.map((line) => ({
        key: line.key,
        label: line.label,
        color: line.color,
        valueFormatter: (value: number | null) =>
          value === null ? "n/a" : `${value.toFixed(1)} мс`,
      })),
      {
        key: "avgLatency",
        label: "Средняя latency (raw)",
        color: "#fde047",
        connectNulls: false,
        valueFormatter: (value: number | null) =>
          value === null ? "n/a" : `${value.toFixed(1)} мс`,
      },
      {
        key: "avgLatencySmooth",
        label: "Средняя latency (MA)",
        color: "#fb7185",
        strokeDasharray: "6 4",
        valueFormatter: (value: number | null) =>
          value === null ? "n/a" : `${value.toFixed(1)} мс`,
      },
    ];
  }, [series]);

  return (
    <TimelineChart
      data={data}
      lines={lines}
      yLabel="мс"
      yDomain={[0, "auto"]}
      yTickFormatter={(value) => `${value}`}
      leftBands={latencyChartBands}
    />
  );
}
