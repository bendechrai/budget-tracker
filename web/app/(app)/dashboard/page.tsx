"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";
import { logError } from "@/lib/logging";
import { useWhatIf } from "@/app/contexts/WhatIfContext";
import HealthBar from "./HealthBar";
import TimelineChart from "./TimelineChart";
import UpcomingObligations from "./UpcomingObligations";
import NudgeCards from "./NudgeCards";
import ScenarioBanner from "@/app/components/ScenarioBanner";
import ContributionModal from "@/app/(app)/obligations/ContributionModal";

interface EngineSnapshot {
  id: string;
  totalRequired: number;
  totalFunded: number;
  nextActionAmount: number;
  nextActionDate: string;
  nextActionDescription: string;
  nextActionObligationId: string | null;
  calculatedAt: string;
}

interface ObligationData {
  id: string;
  name: string;
  amount: number;
  fundBalance: { currentBalance: number } | null;
}

interface ScenarioSnapshot {
  totalRequired: number;
  totalFunded: number;
  nextActionAmount: number;
  nextActionDate: string;
  nextActionDescription: string;
}

interface TimelineData {
  dataPoints: Array<{ date: string; projectedBalance: number }>;
  expenseMarkers: Array<{
    date: string;
    obligationId: string;
    obligationName: string;
    amount: number;
  }>;
  crunchPoints: Array<{
    date: string;
    projectedBalance: number;
    triggerObligationId: string;
    triggerObligationName: string;
  }>;
  startDate: string;
  endDate: string;
}

interface ScenarioResponse {
  snapshot: ScenarioSnapshot;
  timeline: TimelineData;
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
    timeZone: "UTC",
  });
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasObligations, setHasObligations] = useState<boolean | null>(null);
  const [obligations, setObligations] = useState<ObligationData[]>([]);
  const [scenarioSnapshot, setScenarioSnapshot] =
    useState<ScenarioSnapshot | null>(null);
  const [scenarioTimeline, setScenarioTimeline] =
    useState<TimelineData | null>(null);
  const [showContributionModal, setShowContributionModal] = useState(false);

  const { isActive, overrides } = useWhatIf();
  const scenarioAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [snapshotRes, obligationsRes] = await Promise.all([
        fetch("/api/engine/recalculate", { method: "POST" }),
        fetch("/api/obligations"),
      ]);

      if (obligationsRes.ok) {
        const oblData = (await obligationsRes.json()) as ObligationData[];
        setObligations(oblData);
        setHasObligations(oblData.length > 0);
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

  useEffect(() => {
    const handleDataChanged = () => void fetchData();
    window.addEventListener("budget-data-changed", handleDataChanged);
    return () => window.removeEventListener("budget-data-changed", handleDataChanged);
  }, [fetchData]);

  // Fetch scenario data when what-if overrides change
  useEffect(() => {
    if (!isActive) {
      setScenarioSnapshot(null);
      setScenarioTimeline(null);
      return;
    }

    // Abort any in-flight scenario request
    if (scenarioAbortRef.current) {
      scenarioAbortRef.current.abort();
    }
    const controller = new AbortController();
    scenarioAbortRef.current = controller;

    const toggledOffIds = Array.from(overrides.toggledOffIds);
    const amountOverrides: Record<string, number> = {};
    for (const [id, amount] of overrides.amountOverrides) {
      amountOverrides[id] = amount;
    }
    const hypotheticals = overrides.hypotheticals.map((h) => ({
      ...h,
      nextDueDate: h.nextDueDate instanceof Date ? h.nextDueDate.toISOString() : h.nextDueDate,
      endDate: h.endDate instanceof Date ? h.endDate.toISOString() : h.endDate,
    }));
    const escalationOverrides: Record<string, Array<{ id: string; changeType: string; value: number; effectiveDate: string; intervalMonths: number | null; isApplied: boolean }>> = {};
    for (const [oblId, rules] of overrides.escalationOverrides) {
      escalationOverrides[oblId] = rules.map((r) => ({
        id: r.id,
        changeType: r.changeType,
        value: r.value,
        effectiveDate: r.effectiveDate instanceof Date ? r.effectiveDate.toISOString() : String(r.effectiveDate),
        intervalMonths: r.intervalMonths,
        isApplied: false,
      }));
    }

    void (async () => {
      try {
        const res = await fetch("/api/engine/scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toggledOffIds,
            amountOverrides,
            hypotheticals,
            escalationOverrides,
          }),
          signal: controller.signal,
        });

        if (!res.ok) return;

        const data = (await res.json()) as ScenarioResponse;
        setScenarioSnapshot(data.snapshot);
        setScenarioTimeline(data.timeline);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logError("failed to fetch scenario data", err);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isActive, overrides]);

  const isEmptyState =
    snapshot !== null &&
    snapshot.totalRequired === 0 &&
    hasObligations === false;

  // Determine which snapshot to display in hero card
  const displaySnapshot =
    isActive && scenarioSnapshot !== null ? scenarioSnapshot : snapshot;

  const displayIsFullyFunded =
    displaySnapshot !== null &&
    displaySnapshot.nextActionAmount === 0 &&
    displaySnapshot.totalRequired > 0;

  // Find the obligation for the hero card's "Mark as done" action
  const nextActionObligation =
    snapshot?.nextActionObligationId
      ? obligations.find((o) => o.id === snapshot.nextActionObligationId) ?? null
      : null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title} data-testid="page-title">Dashboard</h1>

        <ScenarioBanner />

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

        {!loading && !error && !isEmptyState && (
          <div className={styles.topRow}>
            {displayIsFullyFunded && displaySnapshot && (
              <div
                className={`${styles.heroCard} ${styles.heroCelebration} ${isActive ? styles.heroScenario : ""}`}
              >
                {isActive && (
                  <div className={styles.scenarioIndicator} data-testid="scenario-indicator">
                    What-if scenario
                  </div>
                )}
                <div className={styles.celebrationEmoji} aria-hidden="true">
                  &#127881;
                </div>
                <h2 className={styles.celebrationTitle}>
                  {"You're fully covered!"}
                </h2>
                <p className={styles.celebrationDescription}>
                  All obligations are fully funded. Next due date:{" "}
                  {formatDate(displaySnapshot.nextActionDate)}
                </p>
              </div>
            )}

            {!displayIsFullyFunded && displaySnapshot && (
              <div
                className={`${styles.heroCard} ${isActive ? styles.heroScenario : ""}`}
              >
                {isActive && (
                  <div className={styles.scenarioIndicator} data-testid="scenario-indicator">
                    What-if scenario
                  </div>
                )}
                <p className={styles.heroLabel}>Next action</p>
                <p className={styles.heroAmount}>
                  {formatCurrency(displaySnapshot.nextActionAmount)}
                </p>
                <p className={styles.heroDescription}>
                  {displaySnapshot.nextActionDescription}
                </p>
                <p className={styles.heroDeadline}>
                  Due by {formatDate(displaySnapshot.nextActionDate)}
                </p>
                {!isActive && snapshot?.nextActionObligationId && (
                  <button
                    type="button"
                    className={styles.markDoneButton}
                    onClick={() => setShowContributionModal(true)}
                    data-testid="hero-mark-done"
                  >
                    Mark as done
                  </button>
                )}
              </div>
            )}

            {snapshot && (
              <HealthBar
                totalFunded={snapshot.totalFunded}
                totalRequired={snapshot.totalRequired}
                scenarioTotalFunded={
                  isActive && scenarioSnapshot
                    ? scenarioSnapshot.totalFunded
                    : undefined
                }
                scenarioTotalRequired={
                  isActive && scenarioSnapshot
                    ? scenarioSnapshot.totalRequired
                    : undefined
                }
              />
            )}
          </div>
        )}

        {!loading && !error && !isEmptyState && <NudgeCards />}

        {!loading && !error && !isEmptyState && (
          <div className={styles.mainContent}>
            <div className={styles.timelineSection}>
              <TimelineChart scenarioData={isActive ? scenarioTimeline : null} />
            </div>
            <aside className={styles.sidebar}>
              <UpcomingObligations />
            </aside>
          </div>
        )}
      </div>

      {showContributionModal && nextActionObligation && snapshot && (
        <ContributionModal
          obligationId={nextActionObligation.id}
          obligationName={nextActionObligation.name}
          currentBalance={nextActionObligation.fundBalance?.currentBalance ?? 0}
          amountNeeded={nextActionObligation.amount}
          recommendedContribution={snapshot.nextActionAmount}
          onClose={() => setShowContributionModal(false)}
          onSaved={() => setShowContributionModal(false)}
        />
      )}
    </div>
  );
}
