export type ConnectionStatus = "online" | "degraded" | "offline";

export interface ConnectivitySample {
  timestamp: number;
  status: ConnectionStatus;
  probeLatencyMs: number | null;
}

export interface SpeedSample {
  timestamp: number;
  downloadMbps: number | null;
  uploadMbps: number | null;
  measurementSource?: SpeedMeasurementSource;
  sampleDurationMs?: number | null;
  sampleBytes?: number | null;
  isApproximate?: boolean;
  usedCompressedTransfer?: boolean | null;
}

export interface EndpointConfig {
  id: string;
  label: string;
  url: string;
}

export interface EndpointLatencySnapshot {
  endpointId: string;
  latencyMs: number | null;
  isSuccess: boolean;
  timestamp: number;
}

export interface EndpointLatencyHistoryPoint {
  timestamp: number;
  values: Record<string, number | null>;
}

export interface EndpointStats {
  endpointId: string;
  label: string;
  url: string;
  lastLatencyMs: number | null;
  sampleFailureRatePercent: number;
  sampleSuccessRatePercent: number;
  lastUpdatedAt: number | null;
}

export interface DegradationEvent {
  id: string;
  status: Exclude<ConnectionStatus, "online">;
  startedAt: number;
  endedAt: number | null;
}

export interface PeriodMetricSummary {
  avg: number | null;
  min: number | null;
  max: number | null;
  p95: number | null;
}

export interface ReliabilitySummary {
  uptimePercent: number | null;
  disconnectCount: number;
  longestOutageMs: number;
}

export interface ConnectionProbeResult {
  status: ConnectionStatus;
  latencyMs: number | null;
}

export interface SpeedProbeResult {
  downloadMbps: number | null;
  uploadMbps: number | null;
  measurementSource: SpeedMeasurementSource;
  sampleDurationMs: number | null;
  sampleBytes: number | null;
  isApproximate: boolean;
  usedCompressedTransfer: boolean | null;
}

export type SpeedMeasurementSource = "file_download" | "unavailable";

export interface NetworkMonitorState {
  startedAt: number;
  connectionStatus: ConnectionStatus;
  qualityScore: number;
  qualityLabel: "excellent" | "good" | "warning" | "poor";
  lastUpdatedAt: number | null;
  connectivityHistory: ConnectivitySample[];
  speedHistory: SpeedSample[];
  endpointLatencyHistory: EndpointLatencyHistoryPoint[];
  endpointStats: EndpointStats[];
  degradationEvents: DegradationEvent[];
  latestError: string | null;
  isPaused: boolean;
}
