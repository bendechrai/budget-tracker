"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./upcoming.module.css";
import { logError } from "@/lib/logging";

interface ObligationData {
  id: string;
  name: string;
  amount: number;
  nextDueDate: string;
  isPaused: boolean;
  type: string;
  frequency?: string | null;
  frequencyDays?: number | null;
  endDate?: string | null;
  customEntries?: { dueDate: string; amount: number }[];
  fundBalance: { currentBalance: number } | null;
}

interface ProjectedObligation extends ObligationData {
  projectedDate: string;
  instanceKey: string;
}

interface GroupedObligations {
  dateLabel: string;
  dateKey: string;
  obligations: ProjectedObligation[];
}

const DAY_OPTIONS = [15, 30, 45, 90] as const;
const DEFAULT_DAYS = 45;

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function toDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addFrequencyInterval(date: Date, frequency: string, frequencyDays?: number | null): Date {
  const next = new Date(date);
  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "fortnightly":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "annual":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    case "custom":
      next.setUTCDate(next.getUTCDate() + (frequencyDays ?? 30));
      break;
    default:
      return new Date(NaN);
  }
  return next;
}

function projectOccurrences(
  obligations: ObligationData[],
  cutoff: Date,
  now: Date
): ProjectedObligation[] {
  const results: ProjectedObligation[] = [];

  for (const ob of obligations) {
    if (ob.isPaused) continue;

    if (ob.type === "custom" && ob.customEntries?.length) {
      for (const entry of ob.customEntries) {
        const entryDate = new Date(entry.dueDate);
        if (entryDate >= now && entryDate <= cutoff) {
          results.push({
            ...ob,
            amount: entry.amount,
            projectedDate: entry.dueDate,
            instanceKey: `${ob.id}-custom-${entry.dueDate}`,
          });
        }
      }
      continue;
    }

    const dueDate = new Date(ob.nextDueDate);
    if (dueDate > cutoff) continue;

    const isRecurring =
      ob.type === "recurring" || ob.type === "recurring_with_end";
    const frequency = ob.frequency;
    const endDate = ob.endDate ? new Date(ob.endDate) : null;

    if (!isRecurring || !frequency || frequency === "irregular") {
      if (dueDate >= now && dueDate <= cutoff) {
        results.push({
          ...ob,
          projectedDate: ob.nextDueDate,
          instanceKey: `${ob.id}-0`,
        });
      }
      continue;
    }

    let current = new Date(dueDate);
    let idx = 0;
    while (current <= cutoff) {
      if (endDate && current > endDate) break;
      if (current >= now) {
        results.push({
          ...ob,
          projectedDate: current.toISOString(),
          instanceKey: `${ob.id}-${idx}`,
        });
      }
      idx++;
      current = addFrequencyInterval(current, frequency, ob.frequencyDays);
      if (isNaN(current.getTime())) break;
    }
  }

  return results.sort(
    (a, b) =>
      new Date(a.projectedDate).getTime() -
      new Date(b.projectedDate).getTime()
  );
}

function getFundStatus(
  obligation: ObligationData
): "fully-funded" | "partially-funded" | "unfunded" {
  const balance = obligation.fundBalance?.currentBalance ?? 0;
  if (balance >= obligation.amount) return "fully-funded";
  if (balance > 0) return "partially-funded";
  return "unfunded";
}

function getFundStatusLabel(status: "fully-funded" | "partially-funded" | "unfunded"): string {
  if (status === "fully-funded") return "Fully funded";
  if (status === "partially-funded") return "Partially funded";
  return "Unfunded";
}

function groupByDate(obligations: ProjectedObligation[]): GroupedObligations[] {
  const groups = new Map<string, ProjectedObligation[]>();

  for (const ob of obligations) {
    const key = toDateKey(ob.projectedDate);
    const existing = groups.get(key);
    if (existing) {
      existing.push(ob);
    } else {
      groups.set(key, [ob]);
    }
  }

  return Array.from(groups.entries()).map(([dateKey, obs]) => ({
    dateLabel: formatDate(obs[0].projectedDate),
    dateKey,
    obligations: obs,
  }));
}

export default function UpcomingObligations() {
  const [allObligations, setAllObligations] = useState<ObligationData[]>([]);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await fetch("/api/obligations");
      if (!res.ok) {
        setError("Failed to load upcoming obligations");
        return;
      }

      const all = (await res.json()) as ObligationData[];
      setAllObligations(all);
    } catch (err) {
      logError("failed to fetch upcoming obligations", err);
      setError("Failed to load upcoming obligations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUpcoming();
  }, [fetchUpcoming]);

  useEffect(() => {
    const handleDataChanged = () => void fetchUpcoming();
    window.addEventListener("budget-data-changed", handleDataChanged);
    return () => window.removeEventListener("budget-data-changed", handleDataChanged);
  }, [fetchUpcoming]);

  if (loading) {
    return <div className={styles.section}><p className={styles.loading}>Loading upcoming...</p></div>;
  }

  if (error) {
    return (
      <div className={styles.section}>
        <p className={styles.error} role="alert">{error}</p>
      </div>
    );
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);
  const obligations = projectOccurrences(allObligations, cutoff, now);
  const grouped = groupByDate(obligations);

  return (
    <div className={styles.section}>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>Upcoming obligations</h2>
        <div className={styles.dayFilters} data-testid="upcoming-day-filters">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`${styles.dayButton} ${d === days ? styles.dayButtonActive : ""}`}
              onClick={() => setDays(d)}
              aria-pressed={d === days}
              data-testid={`upcoming-filter-${d}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {obligations.length === 0 && (
        <p className={styles.empty}>No obligations due in the next {days} days.</p>
      )}

      {grouped.map((group) => (
        <div key={group.dateKey} className={styles.dateGroup}>
          <h3 className={styles.dateLabel}>{group.dateLabel}</h3>
          <ul className={styles.list}>
            {group.obligations.map((ob) => {
              const status = getFundStatus(ob);
              return (
                <li key={ob.instanceKey} className={styles.item}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemName}>{ob.name}</span>
                    <span className={styles.itemAmount}>
                      {formatCurrency(ob.amount)}
                    </span>
                  </div>
                  <span className={`${styles.fundStatus} ${styles[status]}`}>
                    {getFundStatusLabel(status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
