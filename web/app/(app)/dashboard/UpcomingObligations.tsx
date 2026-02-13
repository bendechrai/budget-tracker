"use client";

import { useState, useEffect } from "react";
import styles from "./upcoming.module.css";
import { logError } from "@/lib/logging";

interface ObligationData {
  id: string;
  name: string;
  amount: number;
  nextDueDate: string;
  isPaused: boolean;
  fundBalance: { currentBalance: number } | null;
}

interface GroupedObligations {
  dateLabel: string;
  dateKey: string;
  obligations: ObligationData[];
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function groupByDate(obligations: ObligationData[]): GroupedObligations[] {
  const groups = new Map<string, ObligationData[]>();

  for (const ob of obligations) {
    const key = toDateKey(ob.nextDueDate);
    const existing = groups.get(key);
    if (existing) {
      existing.push(ob);
    } else {
      groups.set(key, [ob]);
    }
  }

  return Array.from(groups.entries()).map(([dateKey, obs]) => ({
    dateLabel: formatDate(obs[0].nextDueDate),
    dateKey,
    obligations: obs,
  }));
}

export default function UpcomingObligations() {
  const [obligations, setObligations] = useState<ObligationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchUpcoming() {
      try {
        const res = await fetch("/api/obligations");
        if (!res.ok) {
          setError("Failed to load upcoming obligations");
          return;
        }

        const all = (await res.json()) as ObligationData[];

        const now = new Date();
        const thirtyDaysLater = new Date(now);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        const upcoming = all.filter((ob) => {
          const dueDate = new Date(ob.nextDueDate);
          return dueDate >= now && dueDate <= thirtyDaysLater && !ob.isPaused;
        });

        upcoming.sort(
          (a, b) =>
            new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
        );

        setObligations(upcoming);
      } catch (err) {
        logError("failed to fetch upcoming obligations", err);
        setError("Failed to load upcoming obligations");
      } finally {
        setLoading(false);
      }
    }

    void fetchUpcoming();
  }, []);

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

  const grouped = groupByDate(obligations);

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Upcoming obligations</h2>

      {obligations.length === 0 && (
        <p className={styles.empty}>No obligations due in the next 30 days.</p>
      )}

      {grouped.map((group) => (
        <div key={group.dateKey} className={styles.dateGroup}>
          <h3 className={styles.dateLabel}>{group.dateLabel}</h3>
          <ul className={styles.list}>
            {group.obligations.map((ob) => {
              const status = getFundStatus(ob);
              return (
                <li key={ob.id} className={styles.item}>
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
