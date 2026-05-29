import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LatencyDistributionChartProps {
  latencyValues: number[];
}

interface HistogramBin {
  range: string;
  count: number;
}

const binEdges = [0, 50, 100, 150, 250, 400, 1_000];

function buildHistogram(values: number[]): HistogramBin[] {
  const bins = binEdges.slice(0, -1).map((from, index) => ({
    from,
    to: binEdges[index + 1],
    count: 0,
  }));

  for (const value of values) {
    const bucket =
      bins.find((bin) => value >= bin.from && value < bin.to) ?? bins[bins.length - 1];
    if (bucket) {
      bucket.count += 1;
    }
  }

  return bins.map((bin) => ({
    range: `${bin.from}-${bin.to}ms`,
    count: bin.count,
  }));
}

export function LatencyDistributionChart({
  latencyValues,
}: LatencyDistributionChartProps) {
  const data = buildHistogram(latencyValues);

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="range" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
          <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              color: "#e2e8f0",
              borderRadius: 8,
            }}
          />
          <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
