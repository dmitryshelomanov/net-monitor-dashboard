import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TimelinePoint = {
  ts: number;
  [key: string]: string | number | boolean | null;
};

export interface TimelineLineConfig {
  key: string;
  label: string;
  color: string;
  valueFormatter?: (value: number | null) => string;
  yAxisId?: "left" | "right";
  type?: "monotone" | "stepAfter" | "linear";
  connectNulls?: boolean;
  strokeDasharray?: string;
}

export interface TimelineBandConfig {
  from: number;
  to: number;
  color: string;
  label?: string;
}

export interface TimelineRightAxisConfig {
  yLabel?: string;
  yDomain?: [number | "auto", number | "auto"];
  yTickFormatter?: (value: number) => string;
}

interface TimelineChartProps {
  data: TimelinePoint[];
  lines: TimelineLineConfig[];
  yLabel?: string;
  yDomain?: [number | "auto", number | "auto"];
  yTicks?: number[];
  yTickFormatter?: (value: number) => string;
  rightAxis?: TimelineRightAxisConfig;
  leftBands?: TimelineBandConfig[];
}

export function TimelineChart({
  data,
  lines,
  yLabel,
  yDomain = ["auto", "auto"],
  yTicks,
  yTickFormatter,
  rightAxis,
  leftBands,
}: TimelineChartProps) {
  const safeData = data
    .filter((item) => Number.isFinite(item.ts))
    .sort((a, b) => Number(a.ts) - Number(b.ts));

  const lineFormatters = Object.fromEntries(
    lines.map((line) => [line.key, line.valueFormatter]),
  ) as Record<string, ((value: number | null) => string) | undefined>;
  const formatTickTime = (ts: number) => new Date(ts).toLocaleTimeString();

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={safeData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#cbd5e1", fontSize: 12 }}
            tickFormatter={formatTickTime}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#cbd5e1", fontSize: 12 }}
            ticks={yTicks}
            tickFormatter={yTickFormatter}
            label={
              yLabel
                ? {
                    value: yLabel,
                    angle: -90,
                    position: "insideLeft",
                    fill: "#cbd5e1",
                    dy: 40,
                  }
                : undefined
            }
            domain={yDomain}
          />
          {leftBands?.map((band) => (
            <ReferenceArea
              key={`${band.from}-${band.to}-${band.color}`}
              yAxisId="left"
              y1={band.from}
              y2={band.to}
              fill={band.color}
              ifOverflow="extendDomain"
            />
          ))}
          {rightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={rightAxis.yDomain ?? ["auto", "auto"]}
              tick={{ fill: "#cbd5e1", fontSize: 12 }}
              tickFormatter={rightAxis.yTickFormatter}
              label={
                rightAxis.yLabel
                  ? {
                      value: rightAxis.yLabel,
                      angle: 90,
                      position: "insideRight",
                      fill: "#cbd5e1",
                      dy: -40,
                    }
                  : undefined
              }
            />
          )}
          <Tooltip
            labelFormatter={(label) => {
              if (typeof label === "number") {
                return formatTickTime(label);
              }
              return String(label);
            }}
            formatter={(value, name, item) => {
              const dataKey = String(item.dataKey);
              const isNA = Boolean(
                (item.payload as Record<string, unknown>)[`${dataKey}__na`],
              );
              if (isNA) {
                return ["n/a", name];
              }
              const numericValue =
                typeof value === "number" ? value : Number(value ?? NaN);
              const formatter = lineFormatters[item.dataKey as string];
              if (formatter) {
                return [
                  formatter(Number.isNaN(numericValue) ? null : numericValue),
                  name,
                ];
              }
              return [value, name];
            }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              color: "#e2e8f0",
              borderRadius: 8,
            }}
          />
          <Legend />
          {lines.map((line) => (
            <Line
              key={line.key}
              type={line.type ?? "monotone"}
              dataKey={line.key}
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              name={line.label}
              connectNulls={line.connectNulls ?? true}
              strokeDasharray={line.strokeDasharray}
              isAnimationActive={false}
              yAxisId={line.yAxisId ?? "left"}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
