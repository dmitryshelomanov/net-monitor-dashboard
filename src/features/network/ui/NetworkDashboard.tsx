import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  ProgressBar,
} from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNetworkMonitor } from "../hooks/useNetworkMonitor";
import {
  DEGRADATION_ALERT,
  MONITORING_RANGES,
  RANGE_WINDOWS_MS,
} from "../model/constants";
import type { MonitoringRange } from "../model/types";
import {
  collectLatencySamples,
  computeReliabilitySummary,
  filterByRange,
  summarizeEndpointStats,
  summarizeRangeMetrics,
} from "../model/utils";
import styles from "./NetworkDashboard.module.scss";
import { EndpointHealthChart } from "./charts/EndpointHealthChart";
import { LatencyDistributionChart } from "./charts/LatencyDistributionChart";
import { TimelineChart } from "./charts/TimelineChart";
import {
  connectionChartRightAxis,
  createConnectionChartLines,
  createSpeedChartLines,
  ENDPOINT_LINE_COLORS,
  MAX_PLAUSIBLE_MBPS,
  speedChartBands,
} from "./model/chartPresets";
import {
  buildEndpointSeries,
  mapConnectionChartData,
  mapEndpointHistoryData,
  mapSpeedChartData,
} from "./model/dashboardMappers";
import {
  formatMetricNumber,
  formatDuration,
  formatTime,
  levelToStatusLabel,
  qualityColorMap,
  statusColorMap,
  statusLabelMap,
} from "./model/dashboardFormatters";

export function NetworkDashboard() {
  const { state, hasData } = useNetworkMonitor();
  const [selectedRange, setSelectedRange] = useState<MonitoringRange>("1h");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastAlertAtRef = useRef(0);

  const anchorTs = state.lastUpdatedAt ?? state.startedAt;
  const rangeStartTs = anchorTs - RANGE_WINDOWS_MS[selectedRange];
  const rangeStartedAt = Math.max(state.startedAt, rangeStartTs);
  const filteredConnectivityHistory = useMemo(() => {
    return filterByRange(state.connectivityHistory, selectedRange, anchorTs);
  }, [anchorTs, selectedRange, state.connectivityHistory]);
  const filteredSpeedHistory = useMemo(() => {
    return filterByRange(state.speedHistory, selectedRange, anchorTs);
  }, [anchorTs, selectedRange, state.speedHistory]);
  const filteredEndpointLatencyHistory = useMemo(() => {
    return filterByRange(state.endpointLatencyHistory, selectedRange, anchorTs);
  }, [anchorTs, selectedRange, state.endpointLatencyHistory]);

  const endpointStats = state.endpointStats;
  const endpointSummary = useMemo(
    () => summarizeEndpointStats(endpointStats),
    [endpointStats],
  );
  const periodSummary = useMemo(() => {
    return summarizeRangeMetrics(
      filteredSpeedHistory,
      filteredEndpointLatencyHistory,
    );
  }, [filteredEndpointLatencyHistory, filteredSpeedHistory]);
  const reliabilitySummary = useMemo(
    () => computeReliabilitySummary(filteredConnectivityHistory),
    [filteredConnectivityHistory],
  );
  const latencyDistribution = useMemo(
    () => collectLatencySamples(filteredEndpointLatencyHistory),
    [filteredEndpointLatencyHistory],
  );

  const incidents = useMemo(() => {
    return state.degradationEvents
      .filter((event) => (event.endedAt ?? anchorTs) >= rangeStartTs)
      .map((event) => {
        const endedAt = event.endedAt ?? anchorTs;
        return {
          ...event,
          durationMs: Math.max(0, endedAt - event.startedAt),
        };
      })
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [anchorTs, rangeStartTs, state.degradationEvents]);

  useEffect(() => {
    const activeEvent = state.degradationEvents.findLast(
      (item) => item.endedAt === null,
    );
    if (!activeEvent) {
      return;
    }

    const durationMs = anchorTs - activeEvent.startedAt;
    const now = Date.now();
    if (
      durationMs < DEGRADATION_ALERT.sustainedDurationMs ||
      now - lastAlertAtRef.current < DEGRADATION_ALERT.cooldownMs
    ) {
      return;
    }

    const nextMessage =
      activeEvent.status === "offline"
        ? "Сеть офлайн больше 2 минут"
        : "Сеть нестабильна больше 2 минут";
    setToastMessage(nextMessage);
    lastAlertAtRef.current = now;
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 5_000);
  }, [anchorTs, state.degradationEvents]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const averageDownloadMbps = useMemo(() => {
    const values = filteredSpeedHistory
      .map((item) => item.downloadMbps)
      .filter(
        (value): value is number =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value > 0 &&
          value < MAX_PLAUSIBLE_MBPS,
      );

    if (values.length === 0) {
      return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [filteredSpeedHistory]);
  const lastSpeedSample = filteredSpeedHistory.at(-1) ?? null;

  const connectionChartData = useMemo(() => {
    return mapConnectionChartData(filteredConnectivityHistory);
  }, [filteredConnectivityHistory]);

  const speedChartData = useMemo(() => {
    return mapSpeedChartData(filteredSpeedHistory, rangeStartedAt);
  }, [filteredSpeedHistory, rangeStartedAt]);

  const endpointHistoryData = useMemo(() => {
    return mapEndpointHistoryData(
      filteredEndpointLatencyHistory,
      endpointStats,
      rangeStartedAt,
    );
  }, [endpointStats, filteredEndpointLatencyHistory, rangeStartedAt]);

  const endpointSeries = useMemo(() => {
    return buildEndpointSeries(endpointStats, ENDPOINT_LINE_COLORS);
  }, [endpointStats]);
  const connectionLines = useMemo(() => {
    return createConnectionChartLines(levelToStatusLabel);
  }, []);
  const speedLines = useMemo(() => {
    return createSpeedChartLines();
  }, []);

  const exportPayload = useMemo(() => {
    return {
      generatedAt: new Date(anchorTs).toISOString(),
      range: selectedRange,
      connectivityHistory: filteredConnectivityHistory,
      speedHistory: filteredSpeedHistory,
      endpointLatencyHistory: filteredEndpointLatencyHistory,
      incidents,
      periodSummary,
      reliabilitySummary,
    };
  }, [
    anchorTs,
    filteredConnectivityHistory,
    filteredEndpointLatencyHistory,
    filteredSpeedHistory,
    incidents,
    periodSummary,
    reliabilitySummary,
    selectedRange,
  ]);

  function downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportAsJson() {
    downloadFile(
      `network-report-${selectedRange}.json`,
      JSON.stringify(exportPayload, null, 2),
      "application/json",
    );
  }

  function exportAsCsv() {
    const rows = [
      ["timestamp", "connectionStatus", "probeLatencyMs", "downloadMbps"],
      ...filteredConnectivityHistory.map((item, index) => [
        new Date(item.timestamp).toISOString(),
        item.status,
        item.probeLatencyMs ?? "",
        filteredSpeedHistory[index]?.downloadMbps ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    downloadFile(`network-report-${selectedRange}.csv`, csv, "text/csv");
  }

  return (
    <section className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1>Network Pulse</h1>
          <p className={styles.subtitle}>
            Frontend-only мониторинг соединения, скорости и HTTP latency.
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.rangeButtons}>
            {MONITORING_RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  selectedRange === item.key
                    ? `${styles.rangeButton} ${styles.rangeButtonActive}`
                    : styles.rangeButton
                }
                onClick={() => setSelectedRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={styles.exportButtons}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={exportAsCsv}
            >
              Export CSV
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={exportAsJson}
            >
              Export JSON
            </button>
          </div>
        </div>
      </header>

      {toastMessage && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      {state.latestError && (
        <Card>
          <CardContent>
            <p>{state.latestError}</p>
          </CardContent>
        </Card>
      )}

      <div className={styles.charts}>
        <Card>
          <CardHeader>
            <CardTitle>Connection timeline</CardTitle>
            <CardDescription>
              История статуса подключения и задержки ответа HTTP-запроса: Офлайн
              / Нестабильно / Онлайн.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connectionChartData.length > 0 ? (
              <TimelineChart
                data={connectionChartData}
                lines={connectionLines}
                yDomain={[0, 2]}
                yTicks={[0, 1, 2]}
                yTickFormatter={levelToStatusLabel}
                rightAxis={connectionChartRightAxis}
              />
            ) : (
              <p className={styles.loadingHint}>
                Идет сбор данных для графика...
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Speed timeline</CardTitle>
            <CardDescription>
              HTTP download throughput по тестовым URL, Мбит/с.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimelineChart
              data={speedChartData}
              lines={speedLines}
              yLabel="Мбит/с"
              yDomain={[0, "auto"]}
              leftBands={speedChartBands}
            />
          </CardContent>
        </Card>

        <Card className={styles.tableCard}>
          <CardHeader>
            <CardTitle>Endpoint health</CardTitle>
            <CardDescription>
              Популярные российские сервисы для HTTP latency мониторинга.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EndpointHealthChart
              data={endpointHistoryData}
              series={endpointSeries}
            />
          </CardContent>
        </Card>
      </div>

      <Card className={styles.summaryCard}>
        <CardHeader>
          <CardTitle>Текущая сводка ({selectedRange})</CardTitle>
          <CardDescription>
            Ключевые показатели состояния сети в одном месте.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Метрика</th>
                  <th>Текущее значение</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Соединение</td>
                  <td>
                    <Chip color={statusColorMap[state.connectionStatus]}>
                      {statusLabelMap[state.connectionStatus]}
                    </Chip>
                  </td>
                </tr>
                <tr>
                  <td>Последнее обновление</td>
                  <td>{formatTime(state.lastUpdatedAt)}</td>
                </tr>
                <tr>
                  <td>Средняя скорость Download</td>
                  <td>{formatMetricNumber(averageDownloadMbps, "Мбит/с")}</td>
                </tr>
                <tr>
                  <td>Последний сэмпл скорости</td>
                  <td>
                    {lastSpeedSample?.sampleBytes &&
                    lastSpeedSample?.sampleDurationMs
                      ? `${Math.round(lastSpeedSample.sampleBytes / 1024)} KB за ${lastSpeedSample.sampleDurationMs.toFixed(1)} ms`
                      : "n/a"}
                    {lastSpeedSample?.isApproximate ? " (approximate)" : ""}
                  </td>
                </tr>
                <tr>
                  <td>Скорость Upload</td>
                  <td>n/a (в этом режиме не измеряется)</td>
                </tr>
                <tr>
                  <td>Средняя HTTP latency</td>
                  <td>
                    {formatMetricNumber(endpointSummary.avgLatencyMs, "ms")}
                  </td>
                </tr>
                <tr>
                  <td>Доля неуспешных HTTP проб</td>
                  <td>
                    {formatMetricNumber(
                      endpointSummary.avgFailureRatePercent,
                      "%",
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Оценка качества</td>
                  <td>
                    <Chip color={qualityColorMap[state.qualityLabel]}>
                      {state.qualityLabel.toUpperCase()}
                    </Chip>
                  </td>
                </tr>
                <tr>
                  <td>Баллы качества</td>
                  <td>
                    {state.qualityScore}
                    <ProgressBar value={state.qualityScore} maxValue={100} />
                  </td>
                </tr>
                <tr>
                  <td>Uptime</td>
                  <td>
                    {reliabilitySummary.uptimePercent === null
                      ? "n/a"
                      : `${reliabilitySummary.uptimePercent}%`}
                  </td>
                </tr>
                <tr>
                  <td>Дисконнекты</td>
                  <td>{reliabilitySummary.disconnectCount}</td>
                </tr>
                <tr>
                  <td>Самый длинный outage</td>
                  <td>{formatDuration(reliabilitySummary.longestOutageMs)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className={styles.summaryCard}>
        <CardHeader>
          <CardTitle>Статистика периода</CardTitle>
          <CardDescription>
            Avg / min / max / p95 для download и latency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Метрика</th>
                  <th>Avg</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>P95</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Download, Мбит/с</td>
                  <td>
                    {formatMetricNumber(periodSummary.download.avg, "Мбит/с")}
                  </td>
                  <td>
                    {formatMetricNumber(periodSummary.download.min, "Мбит/с")}
                  </td>
                  <td>
                    {formatMetricNumber(periodSummary.download.max, "Мбит/с")}
                  </td>
                  <td>
                    {formatMetricNumber(periodSummary.download.p95, "Мбит/с")}
                  </td>
                </tr>
                <tr>
                  <td>Latency, ms</td>
                  <td>{formatMetricNumber(periodSummary.latency.avg, "ms")}</td>
                  <td>{formatMetricNumber(periodSummary.latency.min, "ms")}</td>
                  <td>{formatMetricNumber(periodSummary.latency.max, "ms")}</td>
                  <td>{formatMetricNumber(periodSummary.latency.p95, "ms")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className={styles.summaryCard}>
        <CardHeader>
          <CardTitle>Latency distribution</CardTitle>
          <CardDescription>
            Распределение всех latency проб в выбранном периоде.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LatencyDistributionChart latencyValues={latencyDistribution} />
        </CardContent>
      </Card>

      <Card className={styles.summaryCard}>
        <CardHeader>
          <CardTitle>Инциденты стабильности</CardTitle>
          <CardDescription>
            Таймлайн offline/degraded и длительность каждого инцидента.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Старт</th>
                  <th>Финиш</th>
                  <th>Длительность</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={4}>В этом диапазоне нет инцидентов.</td>
                  </tr>
                )}
                {incidents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <Chip color={statusColorMap[event.status]}>
                        {statusLabelMap[event.status]}
                      </Chip>
                    </td>
                    <td>{formatTime(event.startedAt)}</td>
                    <td>
                      {event.endedAt === null
                        ? "идет сейчас"
                        : formatTime(event.endedAt)}
                    </td>
                    <td>{formatDuration(event.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <details className={styles.glossary}>
        <summary>Что означают метрики</summary>
        <p>
          Latency - время ответа HTTP endpoint. P95 - значение, ниже которого
          находятся 95% измерений. Uptime - доля времени со статусом online.
        </p>
      </details>

      <p className={styles.disclaimer}>
        В браузере доступен HTTP latency, а не ICMP ping. Значения пригодны для
        UX мониторинга веб-приложений.
      </p>
      <p className={styles.disclaimer}>
        Speed test: браузерная оценка HTTP throughput, а не "чистый" line rate.
        При сжатии на CDN/сервере метрика может быть помечена как approximate.
      </p>
      {!hasData && (
        <p className={styles.loadingHint}>
          Данные пока не накоплены, показаны стартовые значения.
        </p>
      )}
    </section>
  );
}
