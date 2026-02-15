"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./contribution-history.module.css";
import { logError } from "@/lib/logging";

interface ContributionRecord {
  id: string;
  obligationId: string;
  amount: number;
  date: string;
  type: "contribution" | "manual_adjustment";
  note: string | null;
  createdAt: string;
}

interface ContributionHistoryProps {
  obligationId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ContributionHistory({
  obligationId,
}: ContributionHistoryProps) {
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchContributions = useCallback(async () => {
    try {
      const res = await fetch(`/api/contributions/${obligationId}`);
      if (!res.ok) {
        setError("Failed to load contribution history");
        return;
      }
      const data = (await res.json()) as ContributionRecord[];
      setContributions(data);
    } catch (err) {
      logError("failed to fetch contributions", err);
      setError("Failed to load contribution history");
    } finally {
      setLoading(false);
    }
  }, [obligationId]);

  useEffect(() => {
    void fetchContributions();
  }, [fetchContributions]);

  return (
    <div className={styles.section} data-testid="contribution-history">
      <h3 className={styles.sectionTitle}>Contribution History</h3>

      {loading && (
        <p className={styles.loading} data-testid="contribution-history-loading">
          Loading...
        </p>
      )}

      {error && (
        <p className={styles.error} data-testid="contribution-history-error">
          {error}
        </p>
      )}

      {!loading && !error && contributions.length === 0 && (
        <p className={styles.empty} data-testid="contribution-history-empty">
          No contributions recorded yet.
        </p>
      )}

      {!loading && !error && contributions.length > 0 && (
        <ul className={styles.list} data-testid="contribution-history-list">
          {contributions.map((c) => {
            const isPositive = c.amount >= 0;
            return (
              <li key={c.id} className={styles.item} data-testid={`contribution-item-${c.id}`}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemDate}>
                    {formatDate(c.date)}
                    <span
                      className={`${styles.typeBadge} ${
                        c.type === "contribution"
                          ? styles.typeBadgeContribution
                          : styles.typeBadgeAdjustment
                      }`}
                    >
                      {c.type === "contribution" ? "Contribution" : "Adjustment"}
                    </span>
                  </span>
                  {c.note && (
                    <span className={styles.itemNote}>{c.note}</span>
                  )}
                </div>
                <span
                  className={`${styles.itemAmount} ${
                    isPositive ? styles.itemAmountPositive : styles.itemAmountNegative
                  }`}
                  data-testid={`contribution-amount-${c.id}`}
                >
                  {isPositive ? "+" : "-"}${Math.abs(c.amount).toFixed(2)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
