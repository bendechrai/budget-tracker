"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import styles from "./timeline.module.css";
import { logError } from "@/lib/logging";

interface TimelineDataPoint {
  date: string;
  projectedBalance: number;
}

interface ExpenseMarker {
  date: string;
  obligationId: string;
  obligationName: string;
  amount: number;
}

interface CrunchPoint {
  date: string;
  projectedBalance: number;
  triggerObligationId: string;
  triggerObligationName: string;
}

interface TimelineData {
  dataPoints: TimelineDataPoint[];
  expenseMarkers: ExpenseMarker[];
  crunchPoints: CrunchPoint[];
  startDate: string;
  endDate: string;
}

interface ChartDataPoint {
  date: number;
  dateLabel: string;
  balance: number;
  scenarioBalance?: number;
}

interface TimelineChartProps {
  scenarioData?: TimelineData | null;
}

const RANGE_OPTIONS = [6, 9, 12] as const;

function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function formatTooltipCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTooltipDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
  }>;
  label?: number;
  expenseMarkers: ExpenseMarker[];
  crunchPoints: CrunchPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
  expenseMarkers,
  crunchPoints,
}: CustomTooltipProps) {
  if (!active || !payload || !label) return null;

  const date = new Date(label);
  const dateStr = date.toISOString().split("T")[0];

  const matchingExpenses = expenseMarkers.filter((m) => {
    const mDate = new Date(m.date).toISOString().split("T")[0];
    return mDate === dateStr;
  });

  const matchingCrunches = crunchPoints.filter((c) => {
    const cDate = new Date(c.date).toISOString().split("T")[0];
    return cDate === dateStr;
  });

  return (
    <div
      style={{
        background: "var(--background, #fff)",
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {formatTooltipDate(label)}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatTooltipCurrency(entry.value)}
        </div>
      ))}
      {matchingExpenses.map((exp) => (
        <div
          key={`exp-${exp.obligationId}-${exp.date}`}
          style={{ color: "#d69e2e", marginTop: 4, fontSize: 12 }}
        >
          {exp.obligationName}: -{formatTooltipCurrency(exp.amount)}
        </div>
      ))}
      {matchingCrunches.map((cp) => (
        <div
          key={`crunch-${cp.triggerObligationId}-${cp.date}`}
          style={{ color: "#e53e3e", marginTop: 4, fontSize: 12, fontWeight: 600 }}
        >
          Crunch: {cp.triggerObligationName}
        </div>
      ))}
    </div>
  );
}

export default function TimelineChart({ scenarioData }: TimelineChartProps) {
  const [months, setMonths] = useState<6 | 9 | 12>(6);
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTimeline = useCallback(async (monthsAhead: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/engine/timeline?months=${monthsAhead}`);
      if (!res.ok) {
        setError("Failed to load timeline");
        return;
      }
      const timeline = (await res.json()) as TimelineData;
      setData(timeline);
    } catch (err) {
      logError("failed to fetch timeline", err);
      setError("Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTimeline(months);
  }, [months, fetchTimeline]);

  const chartData = useMemo((): ChartDataPoint[] => {
    if (!data) return [];

    const points: ChartDataPoint[] = data.dataPoints.map((dp) => ({
      date: new Date(dp.date).getTime(),
      dateLabel: formatDateLabel(new Date(dp.date).getTime()),
      balance: dp.projectedBalance,
    }));

    if (scenarioData) {
      const scenarioMap = new Map<string, number>();
      for (const dp of scenarioData.dataPoints) {
        const key = new Date(dp.date).toISOString().split("T")[0];
        scenarioMap.set(key, dp.projectedBalance);
      }

      for (const point of points) {
        const key = new Date(point.date).toISOString().split("T")[0];
        const scenarioBalance = scenarioMap.get(key);
        if (scenarioBalance !== undefined) {
          point.scenarioBalance = scenarioBalance;
        }
      }

      // Add scenario-only points
      for (const dp of scenarioData.dataPoints) {
        const ts = new Date(dp.date).getTime();
        const key = new Date(dp.date).toISOString().split("T")[0];
        const existsInActual = points.some(
          (p) => new Date(p.date).toISOString().split("T")[0] === key
        );
        if (!existsInActual) {
          points.push({
            date: ts,
            dateLabel: formatDateLabel(ts),
            balance: dp.projectedBalance,
            scenarioBalance: dp.projectedBalance,
          });
        }
      }

      points.sort((a, b) => a.date - b.date);
    }

    return points;
  }, [data, scenarioData]);

  const expenseMarkerPoints = useMemo(() => {
    if (!data || chartData.length === 0) return [];

    return data.expenseMarkers.map((marker) => {
      const markerDate = new Date(marker.date).toISOString().split("T")[0];
      const matchingPoint = chartData.find(
        (p) => new Date(p.date).toISOString().split("T")[0] === markerDate
      );
      return {
        ...marker,
        x: new Date(marker.date).getTime(),
        y: matchingPoint?.balance ?? 0,
      };
    });
  }, [data, chartData]);

  const crunchMarkerPoints = useMemo(() => {
    if (!data) return [];

    return data.crunchPoints.map((cp) => ({
      ...cp,
      x: new Date(cp.date).getTime(),
      y: cp.projectedBalance,
    }));
  }, [data]);

  const hasScenario = scenarioData !== null && scenarioData !== undefined;
  const isEmpty = data !== null && data.dataPoints.length <= 1;

  return (
    <div className={styles.timeline} data-testid="timeline-chart">
      <div className={styles.header}>
        <span className={styles.title}>Fund projection</span>
        <div className={styles.rangeSelector} role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`${styles.rangeButton} ${months === opt ? styles.rangeButtonActive : ""}`}
              onClick={() => setMonths(opt)}
              aria-pressed={months === opt}
            >
              {opt}mo
            </button>
          ))}
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading timeline...</div>}

      {error && <div className={styles.error} role="alert">{error}</div>}

      {!loading && !error && isEmpty && (
        <div className={styles.emptyState}>
          Add obligations to see your fund projection
        </div>
      )}

      {!loading && !error && !isEmpty && chartData.length > 0 && (
        <>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="date"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatDateLabel}
                  tick={{ fontSize: 12 }}
                  stroke="#999"
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 12 }}
                  stroke="#999"
                  width={50}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      expenseMarkers={data?.expenseMarkers ?? []}
                      crunchPoints={data?.crunchPoints ?? []}
                    />
                  }
                />

                <ReferenceLine y={0} stroke="#e53e3e" strokeDasharray="3 3" />

                <Line
                  type="monotone"
                  dataKey="balance"
                  name="Projected balance"
                  stroke="#3182ce"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />

                {hasScenario && (
                  <Line
                    type="monotone"
                    dataKey="scenarioBalance"
                    name="Scenario"
                    stroke="#9f7aea"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )}

                {expenseMarkerPoints.map((marker) => (
                  <ReferenceDot
                    key={`expense-${marker.obligationId}-${marker.date}`}
                    x={marker.x}
                    y={marker.y}
                    r={4}
                    fill="#d69e2e"
                    stroke="#d69e2e"
                  />
                ))}

                {crunchMarkerPoints.map((cp) => (
                  <ReferenceDot
                    key={`crunch-${cp.triggerObligationId}-${cp.date}`}
                    x={cp.x}
                    y={cp.y}
                    r={6}
                    fill="#e53e3e"
                    stroke="#e53e3e"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span
                className={styles.legendLine}
                style={{ background: "#3182ce" }}
              />
              Projected balance
            </span>
            <span className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: "#d69e2e" }}
              />
              Expense due
            </span>
            <span className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: "#e53e3e" }}
              />
              Crunch point
            </span>
            {hasScenario && (
              <span className={styles.legendItem}>
                <span className={styles.legendLineDashed} />
                Scenario
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
