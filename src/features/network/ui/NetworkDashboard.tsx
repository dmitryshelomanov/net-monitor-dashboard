import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  ProgressBar,
} from "@heroui/react";
import { useMemo } from "react";
import { useNetworkMonitor } from "../hooks/useNetworkMonitor";
import { summarizeEndpointStats } from "../model/utils";
import styles from "./NetworkDashboard.module.scss";
import { EndpointHealthChart } from "./charts/EndpointHealthChart";
import { TimelineChart } from "./charts/TimelineChart";
import {
  connectionChartRightAxis,
  createConnectionChartLines,
  createSpeedChartLines,
  ENDPOINT_LINE_COLORS,
  MAX_PLAUSIBLE_MBPS,
} from "./model/chartPresets";
import {
  buildEndpointSeries,
  mapConnectionChartData,
  mapEndpointHistoryData,
  mapSpeedChartData,
} from "./model/dashboardMappers";
import {
  formatMetricNumber,
  formatTime,
  levelToStatusLabel,
  qualityColorMap,
  statusColorMap,
  statusLabelMap,
} from "./model/dashboardFormatters";

export function NetworkDashboard() {
  const { state, hasData } = useNetworkMonitor();
  const endpointStats = state.endpointStats;
  const endpointSummary = useMemo(() => {
    return summarizeEndpointStats(endpointStats);
  }, [endpointStats]);
  const averageDownloadMbps = useMemo(() => {
    const values = state.speedHistory
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
  }, [state.speedHistory]);

  const connectionChartData = useMemo(() => {
    return mapConnectionChartData(state.connectivityHistory);
  }, [state.connectivityHistory]);

  const speedChartData = useMemo(() => {
    return mapSpeedChartData(state.speedHistory, state.startedAt);
  }, [state.speedHistory, state.startedAt]);

  const endpointHistoryData = useMemo(() => {
    return mapEndpointHistoryData(
      state.endpointLatencyHistory,
      endpointStats,
      state.startedAt,
    );
  }, [endpointStats, state.endpointLatencyHistory, state.startedAt]);

  const endpointSeries = useMemo(() => {
    return buildEndpointSeries(endpointStats, ENDPOINT_LINE_COLORS);
  }, [endpointStats]);
  const connectionLines = useMemo(() => {
    return createConnectionChartLines(levelToStatusLabel);
  }, []);
  const speedLines = useMemo(() => {
    return createSpeedChartLines();
  }, []);

  return (
    <section className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1>Network Pulse</h1>
          <p className={styles.subtitle}>
            Frontend-only мониторинг соединения, скорости и HTTP latency.
          </p>
        </div>
      </header>

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
              Download по локальным тестовым файлам (`public/speed-test`),
              Мбит/с
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimelineChart
              data={speedChartData}
              lines={speedLines}
              yLabel="Мбит/с"
              yDomain={[0, "auto"]}
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
          <CardTitle>Текущая сводка</CardTitle>
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
                  <td>
                    {formatMetricNumber(averageDownloadMbps, "Мбит/с")}
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
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className={styles.disclaimer}>
        В браузере доступен HTTP latency, а не ICMP ping. Значения пригодны для
        UX мониторинга веб-приложений.
      </p>
      <p className={styles.disclaimer}>
        Speed test: измеряется только download по локальным файлам с
        cache-busting параметром.
      </p>
      {!hasData && (
        <p className={styles.loadingHint}>
          Данные пока не накоплены, показаны стартовые значения.
        </p>
      )}
    </section>
  );
}
