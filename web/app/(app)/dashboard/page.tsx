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
import SuggestionsCard from "./SuggestionsCard";
import ScenarioBanner from "@/app/components/ScenarioBanner";
import ConfirmBalancesModal from "./ConfirmBalancesModal";

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
  type: string;
  amount: number;
  intervalUnit: string | null;
  intervalCount: number;
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
  contributionMarkers: Array<{ date: string; amount: number }>;
  crunchPoints: Array<{
    date: string;
    projectedBalance: number;
    triggerObligationId: string;
    triggerObligationName: string;
  }>;
  minProjectedBalance: number;
  startDate: string;
  endDate: string;
}

interface ScenarioResponse {
  snapshot: ScenarioSnapshot;
  timeline: TimelineData;
}

/**
 * Prorates an obligation amount to its monthly equivalent.
 * Recurring obligations are divided by their interval in months.
 * One-off and custom obligations use the raw amount (lump sum needed).
 */
function monthlyEquivalent(o: ObligationData): number {
  if (o.type === "one_off" || o.type === "custom" || !o.intervalUnit) {
    return o.amount;
  }
  const monthsPerInterval = intervalToMonths(o.intervalUnit, o.intervalCount);
  return o.amount / monthsPerInterval;
}

function intervalToMonths(unit: string, count: number): number {
  switch (unit) {
    case "day": return (count * 12) / 365.25;
    case "week": return (count * 7 * 12) / 365.25;
    case "month": return count;
    case "quarter": return count * 3;
    case "year": return count * 12;
    default: return 1;
  }
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
  const [showConfirmBalancesModal, setShowConfirmBalancesModal] = useState(false);
  const [preseedAmount, setPreseedAmount] = useState(0);

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

  // Compute total required per fund group from obligations (prorated to monthly)
  const fundGroupRequired = new Map<string, number>();
  for (const o of obligations) {
    const current = fundGroupRequired.get(o.fundGroupId) ?? 0;
    fundGroupRequired.set(o.fundGroupId, current + monthlyEquivalent(o));
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

  // Total shortfall across all funds
  const totalShortfall = fundGroupHealthData.reduce((sum, fg) => {
    const remaining = Math.max(0, fg.required - fg.funded);
    return sum + remaining;
  }, 0);

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
            {/* Card 1: Fund Status */}
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
                {fundGroupHealthData.length > 0 && (
                  <>
                    <div className={styles.heroDivider} />
                    <HealthBar fundGroups={fundGroupHealthData} />
                  </>
                )}

                <div className={styles.heroActions}>
                  {!isActive && fundGroups.length > 0 && (
                    <button
                      type="button"
                      className={styles.confirmBalancesButton}
                      onClick={() => setShowConfirmBalancesModal(true)}
                      data-testid="hero-confirm-balances"
                    >
                      Confirm fund balances
                    </button>
                  )}
                </div>
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
                  Total contribution required {displaySnapshot.cyclePeriodLabel}
                </p>
                <p className={styles.heroAmount} data-testid="total-per-cycle">
                  {formatCurrency(displaySnapshot.totalContributionPerCycle)}
                </p>
                <p className={styles.heroDescription}>
                  across all obligations
                </p>

                {preseedAmount > 0 && (
                  <div className={styles.preseedRow} data-testid="preseed-row">
                    <span className={styles.preseedText}>
                      Suggested starting balance: {formatCurrency(preseedAmount)}
                    </span>
                  </div>
                )}

                {totalShortfall > 0 && (
                  <div className={styles.shortfallRow} data-testid="shortfall-row">
                    <span className={styles.shortfallText}>
                      {formatCurrency(totalShortfall)} shortfall across all funds
                    </span>
                  </div>
                )}

                {fundGroupHealthData.length > 0 && (
                  <>
                    <div className={styles.heroDivider} />
                    <HealthBar fundGroups={fundGroupHealthData} />
                  </>
                )}

                <div className={styles.heroActions}>
                  {!isActive && fundGroups.length > 0 && (
                    <button
                      type="button"
                      className={styles.confirmBalancesButton}
                      onClick={() => setShowConfirmBalancesModal(true)}
                      data-testid="hero-confirm-balances"
                    >
                      Confirm fund balances
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Card 2: Suggestions */}
            <SuggestionsCard />
          </div>
        )}

        {!loading && !error && !isEmptyState && (
          <div className={styles.mainContent}>
            <div className={styles.timelineSection}>
              <TimelineChart
                scenarioData={isActive ? scenarioTimeline : null}
                onPreseedChange={setPreseedAmount}
              />
            </div>
            <aside className={styles.sidebar}>
              <UpcomingObligations />
            </aside>
          </div>
        )}
      </div>

      {showConfirmBalancesModal && (
        <ConfirmBalancesModal
          fundGroups={fundGroups.map((fg) => ({
            id: fg.id,
            name: fg.name,
            currentBalance: fg.currentBalance,
          }))}
          onClose={() => setShowConfirmBalancesModal(false)}
          onSaved={() => setShowConfirmBalancesModal(false)}
        />
      )}
    </div>
  );
}
