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

export interface ConnectionProbeResult {
  status: ConnectionStatus;
  latencyMs: number | null;
}

export interface SpeedProbeResult {
  downloadMbps: number | null;
  uploadMbps: number | null;
}

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
  latestError: string | null;
  isPaused: boolean;
}
