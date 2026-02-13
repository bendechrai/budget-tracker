"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";
import { logError } from "@/lib/logging";
import HealthBar from "./HealthBar";
import TimelineChart from "./TimelineChart";

interface EngineSnapshot {
  id: string;
  totalRequired: number;
  totalFunded: number;
  nextActionAmount: number;
  nextActionDate: string;
  nextActionDescription: string;
  calculatedAt: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasObligations, setHasObligations] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [snapshotRes, obligationsRes] = await Promise.all([
        fetch("/api/engine/recalculate", { method: "POST" }),
        fetch("/api/obligations"),
      ]);

      if (obligationsRes.ok) {
        const obligations = (await obligationsRes.json()) as unknown[];
        setHasObligations(obligations.length > 0);
      } else {
        setHasObligations(false);
      }

      if (!snapshotRes.ok) {
        setError("Failed to load dashboard data");
        return;
      }

      const data = (await snapshotRes.json()) as EngineSnapshot;
      setSnapshot(data);
    } catch (err) {
      logError("failed to fetch dashboard data", err);
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const isFullyFunded =
    snapshot !== null &&
    snapshot.nextActionAmount === 0 &&
    snapshot.totalRequired > 0;

  const isEmptyState =
    snapshot !== null &&
    snapshot.totalRequired === 0 &&
    hasObligations === false;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Dashboard</h1>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading && <p className={styles.loading}>Loading...</p>}

        {!loading && !error && isEmptyState && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>Welcome to your dashboard</h2>
            <p className={styles.emptyDescription}>
              Add your income sources and obligations to get started with your
              sinking fund.
            </p>
            <div className={styles.emptyActions}>
              <Link href="/income" className={styles.emptyLink}>
                Add income
              </Link>
              <Link href="/obligations" className={styles.emptyLink}>
                Add obligations
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && isFullyFunded && snapshot && (
          <div className={`${styles.heroCard} ${styles.heroCelebration}`}>
            <div className={styles.celebrationEmoji} aria-hidden="true">
              &#127881;
            </div>
            <h2 className={styles.celebrationTitle}>
              {"You're fully covered!"}
            </h2>
            <p className={styles.celebrationDescription}>
              All obligations are fully funded. Next due date:{" "}
              {formatDate(snapshot.nextActionDate)}
            </p>
          </div>
        )}

        {!loading && !error && !isFullyFunded && !isEmptyState && snapshot && (
          <div className={styles.heroCard}>
            <p className={styles.heroLabel}>Next action</p>
            <p className={styles.heroAmount}>
              {formatCurrency(snapshot.nextActionAmount)}
            </p>
            <p className={styles.heroDescription}>
              {snapshot.nextActionDescription}
            </p>
            <p className={styles.heroDeadline}>
              Due by {formatDate(snapshot.nextActionDate)}
            </p>
          </div>
        )}

        {!loading && !error && !isEmptyState && snapshot && (
          <HealthBar
            totalFunded={snapshot.totalFunded}
            totalRequired={snapshot.totalRequired}
          />
        )}

        {!loading && !error && !isEmptyState && (
          <TimelineChart />
        )}
      </div>
    </div>
  );
}
