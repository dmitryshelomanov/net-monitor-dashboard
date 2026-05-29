import type { ConnectionStatus, NetworkMonitorState } from "../../model/types";

export const statusLabelMap: Record<ConnectionStatus, string> = {
  online: "Онлайн",
  degraded: "Нестабильно",
  offline: "Офлайн",
};

export const statusColorMap: Record<
  ConnectionStatus,
  "success" | "warning" | "danger"
> = {
  online: "success",
  degraded: "warning",
  offline: "danger",
};

export const qualityColorMap: Record<
  NetworkMonitorState["qualityLabel"],
  "success" | "accent" | "warning" | "danger"
> = {
  excellent: "success",
  good: "accent",
  warning: "warning",
  poor: "danger",
};

export function formatMetricNumber(
  value: number | null,
  suffix: string,
  locale = "ru-RU",
): string {
  if (value === null) {
    return "n/a";
  }
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted} ${suffix}`;
}

export function formatTime(timestamp: number | null): string {
  if (timestamp === null) {
    return "n/a";
  }

  return new Date(timestamp).toLocaleTimeString();
}

export function statusToLevel(status: ConnectionStatus): number {
  if (status === "online") {
    return 2;
  }
  if (status === "degraded") {
    return 1;
  }
  return 0;
}

export function levelToStatusLabel(level: number): string {
  if (level >= 2) {
    return "Онлайн";
  }
  if (level >= 1) {
    return "Нестабильно";
  }
  return "Офлайн";
}
