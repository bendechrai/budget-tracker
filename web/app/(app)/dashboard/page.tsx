"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";
import { logError } from "@/lib/logging";
import { useWhatIf } from "@/app/contexts/WhatIfContext";
import HealthBar from "./HealthBar";
import type { FundGroupHealth } from "./HealthBar";
import TimelineChart from "./TimelineChart";
import UpcomingObligations from "./UpcomingObligations";
import NudgeCards from "./NudgeCards";
import ScenarioBanner from "@/app/components/ScenarioBanner";
import ContributionModal from "@/app/(app)/obligations/ContributionModal";
import CatchUpModal from "./CatchUpModal";
import type { CatchUpFundGroup } from "./CatchUpModal";

interface EngineSnapshot {
  id: string;
  totalRequired: number;
  totalFunded: number;
  totalContributionPerCycle: number;
  cyclePeriodLabel: string;
  nextActionAmount: number;
  nextActionDate: string;
  nextActionDescription: string;
  nextActionObligationId: string | null;
  nextActionFundGroupId: string | null;
  calculatedAt: string;
}

interface FundGroupData {
  id: string;
  name: string;
  currentBalance: number;
  _count: { obligations: number };
}

interface ObligationData {
  id: string;
  name: string;
  amount: number;
  nextDueDate: string;
  fundGroupId: string;
  fundGroup: { id: string; name: string; currentBalance: number };
}

interface ScenarioSnapshot {
  totalRequired: number;
  totalFunded: number;
  totalContributionPerCycle: number;
  cyclePeriodLabel: string;
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
  const [fundGroups, setFundGroups] = useState<FundGroupData[]>([]);
  const [scenarioSnapshot, setScenarioSnapshot] =
    useState<ScenarioSnapshot | null>(null);
  const [scenarioTimeline, setScenarioTimeline] =
    useState<TimelineData | null>(null);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);

  const { isActive, overrides } = useWhatIf();
  const scenarioAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [snapshotRes, obligationsRes, fundGroupsRes] = await Promise.all([
        fetch("/api/engine/recalculate", { method: "POST" }),
        fetch("/api/obligations"),
        fetch("/api/fund-groups"),
      ]);

      if (obligationsRes.ok) {
        const oblData = (await obligationsRes.json()) as ObligationData[];
        setObligations(oblData);
        setHasObligations(oblData.length > 0);
      } else {
        setHasObligations(false);
      }

      if (fundGroupsRes.ok) {
        const fgData = (await fundGroupsRes.json()) as FundGroupData[];
        setFundGroups(fgData);
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

  // Find the fund group for the hero card's "Mark as done" action
  const nextActionFundGroup =
    snapshot?.nextActionFundGroupId
      ? fundGroups.find((fg) => fg.id === snapshot.nextActionFundGroupId) ?? null
      : null;

  // Compute total required per fund group from obligations
  const fundGroupRequired = new Map<string, number>();
  for (const o of obligations) {
    const current = fundGroupRequired.get(o.fundGroupId) ?? 0;
    fundGroupRequired.set(o.fundGroupId, current + o.amount);
  }

  // Build per-fund-group health data for the health bar
  const fundGroupHealthData: FundGroupHealth[] = fundGroups
    .filter((fg) => fg._count.obligations > 0)
    .map((fg) => ({
      id: fg.id,
      name: fg.name,
      funded: fg.currentBalance,
      required: fundGroupRequired.get(fg.id) ?? 0,
    }));

  // Determine which fund groups are underfunded (for catch-up button)
  const underfundedFundGroups: CatchUpFundGroup[] = fundGroups
    .filter((fg) => {
      const required = fundGroupRequired.get(fg.id) ?? 0;
      return required > 0 && fg.currentBalance < required;
    })
    .map((fg) => ({
      id: fg.id,
      name: fg.name,
      amountNeeded: fundGroupRequired.get(fg.id) ?? 0,
      currentBalance: fg.currentBalance,
    }));

  const showCatchUpButton = underfundedFundGroups.length > 1 && !isActive;

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
                <p className={styles.heroLabel}>
                  Total contribution {displaySnapshot.cyclePeriodLabel}
                </p>
                <p className={styles.heroAmount} data-testid="total-per-cycle">
                  {formatCurrency(displaySnapshot.totalContributionPerCycle)}
                </p>
                <p className={styles.heroDescription}>
                  across all obligations
                </p>
                <div className={styles.heroDivider} />
                <p className={styles.heroLabel}>Most urgent</p>
                <p className={styles.heroSubAmount}>
                  {formatCurrency(displaySnapshot.nextActionAmount)}
                </p>
                <p className={styles.heroDescription}>
                  {displaySnapshot.nextActionDescription}
                </p>
                <p className={styles.heroDeadline}>
                  Due by {formatDate(displaySnapshot.nextActionDate)}
                </p>
                <div className={styles.heroActions}>
                  {!isActive && snapshot?.nextActionFundGroupId && (
                    <button
                      type="button"
                      className={styles.markDoneButton}
                      onClick={() => setShowContributionModal(true)}
                      data-testid="hero-mark-done"
                    >
                      Mark as done
                    </button>
                  )}
                  {showCatchUpButton && (
                    <button
                      type="button"
                      className={styles.catchUpButton}
                      onClick={() => setShowCatchUpModal(true)}
                      data-testid="catch-up-button"
                    >
                      Catch up
                    </button>
                  )}
                </div>
              </div>
            )}

            {snapshot && (
              <HealthBar
                fundGroups={fundGroupHealthData}
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

      {showContributionModal && nextActionFundGroup && snapshot && (
        <ContributionModal
          fundGroupId={nextActionFundGroup.id}
          fundGroupName={nextActionFundGroup.name}
          currentBalance={nextActionFundGroup.currentBalance}
          amountNeeded={fundGroupRequired.get(nextActionFundGroup.id) ?? 0}
          recommendedContribution={snapshot.nextActionAmount}
          onClose={() => setShowContributionModal(false)}
          onSaved={() => setShowContributionModal(false)}
        />
      )}

      {showCatchUpModal && (
        <CatchUpModal
          fundGroups={underfundedFundGroups}
          onClose={() => setShowCatchUpModal(false)}
          onSaved={() => setShowCatchUpModal(false)}
        />
      )}
    </div>
  );
}
