"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./obligations.module.css";
import { logError } from "@/lib/logging";
import SparkleButton from "@/app/components/SparkleButton";
import { useWhatIf } from "@/app/contexts/WhatIfContext";
import HypotheticalForm from "./HypotheticalForm";
import EscalationForm from "./EscalationForm";
import ContributionModal from "./ContributionModal";

interface FundGroup {
  id: string;
  name: string;
}

interface Escalation {
  id: string;
  obligationId: string;
  changeType: "absolute" | "percentage" | "fixed_increase";
  value: number;
  effectiveDate: string;
  intervalMonths: number | null;
  isApplied: boolean;
  appliedAt: string | null;
}

interface CustomScheduleEntry {
  id: string;
  dueDate: string;
  amount: number;
  isPaid: boolean;
}

interface FundBalanceData {
  currentBalance: number;
}

interface Obligation {
  id: string;
  name: string;
  type: "recurring" | "recurring_with_end" | "one_off" | "custom";
  amount: number;
  frequency: string | null;
  frequencyDays: number | null;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  isPaused: boolean;
  isArchived: boolean;
  fundGroupId: string | null;
  fundGroup: FundGroup | null;
  customEntries: CustomScheduleEntry[];
  fundBalance: FundBalanceData | null;
}

const TYPE_LABELS: Record<string, string> = {
  recurring: "Recurring",
  recurring_with_end: "Recurring (ends)",
  one_off: "One-off",
  custom: "Custom",
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
  irregular: "Irregular",
};

function formatFrequency(
  frequency: string | null,
  frequencyDays: number | null
): string | null {
  if (!frequency) return null;
  if (frequency === "custom" && frequencyDays) {
    return `Every ${frequencyDays} days`;
  }
  return FREQUENCY_LABELS[frequency] ?? frequency;
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

function formatEscalationDescription(esc: Escalation): string {
  if (esc.changeType === "absolute") {
    return `Set to $${Number(esc.value).toFixed(2)}`;
  }
  if (esc.changeType === "percentage") {
    return `+${Number(esc.value)}%`;
  }
  return `+$${Number(esc.value).toFixed(2)}`;
}

function formatEscalationRecurrence(esc: Escalation): string {
  if (esc.intervalMonths === null) {
    return "One-off";
  }
  if (esc.intervalMonths === 12) {
    return "Every year";
  }
  if (esc.intervalMonths === 1) {
    return "Every month";
  }
  return `Every ${esc.intervalMonths} months`;
}

function getFundStatusColor(currentBalance: number, amountNeeded: number): "green" | "amber" | "red" {
  if (amountNeeded <= 0) return "green";
  const pct = (currentBalance / amountNeeded) * 100;
  if (pct >= 80) return "green";
  if (pct >= 40) return "amber";
  return "red";
}

function isPastDue(nextDueDate: string): boolean {
  const due = new Date(nextDueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return due < now;
}

function isCompleted(ob: Obligation): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (ob.type === "recurring_with_end" && ob.endDate) {
    const end = new Date(ob.endDate);
    return end < now;
  }

  if (ob.type === "one_off") {
    return isPastDue(ob.nextDueDate);
  }

  if (ob.type === "custom") {
    const allPaid = ob.customEntries.length > 0 && ob.customEntries.every((e) => e.isPaid);
    if (allPaid) return true;
    const allPast = ob.customEntries.length > 0 && ob.customEntries.every((e) => new Date(e.dueDate) < now);
    if (allPast) return true;
  }

  return false;
}

interface GroupedObligations {
  groupName: string;
  obligations: Obligation[];
}

function groupByFundGroup(obligations: Obligation[]): GroupedObligations[] {
  const groups = new Map<string, Obligation[]>();
  const defaultKey = "__default__";

  for (const ob of obligations) {
    const key = ob.fundGroupId ?? defaultKey;
    const existing = groups.get(key);
    if (existing) {
      existing.push(ob);
    } else {
      groups.set(key, [ob]);
    }
  }

  const result: GroupedObligations[] = [];

  // Default group first
  const defaultGroup = groups.get(defaultKey);
  if (defaultGroup) {
    result.push({ groupName: "Ungrouped", obligations: defaultGroup });
    groups.delete(defaultKey);
  }

  // Named groups
  for (const [, obs] of groups) {
    const groupName = obs[0].fundGroup?.name ?? "Unknown";
    result.push({ groupName, obligations: obs });
  }

  return result;
}

export default function ObligationsPage() {
  const router = useRouter();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [archivedObligations, setArchivedObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHypotheticalForm, setShowHypotheticalForm] = useState(false);
  const [escalations, setEscalations] = useState<Map<string, Escalation[]>>(new Map());
  const [expandedEscalations, setExpandedEscalations] = useState<Set<string>>(new Set());
  const [escalationFormTarget, setEscalationFormTarget] = useState<string | null>(null);
  const [contributionTarget, setContributionTarget] = useState<Obligation | null>(null);
  const { overrides, toggleObligation, overrideAmount, addHypothetical, removeHypothetical } = useWhatIf();

  const archiveObligation = useCallback(async (ob: Obligation) => {
    try {
      await fetch(`/api/obligations/${ob.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });
    } catch (err) {
      logError("failed to archive obligation", err);
    }
  }, []);

  const fetchObligations = useCallback(async () => {
    try {
      const [activeRes, archivedRes] = await Promise.all([
        fetch("/api/obligations"),
        fetch("/api/obligations?archived=true"),
      ]);

      if (!activeRes.ok || !archivedRes.ok) {
        setError("Failed to load obligations");
        return;
      }

      const activeData = (await activeRes.json()) as Obligation[];
      const archivedData = (await archivedRes.json()) as Obligation[];

      // Auto-archive completed obligations
      const completed: Obligation[] = [];
      const active: Obligation[] = [];
      for (const ob of activeData) {
        if (!ob.isPaused && isCompleted(ob)) {
          completed.push(ob);
        } else {
          active.push(ob);
        }
      }

      if (completed.length > 0) {
        await Promise.all(completed.map((ob) => archiveObligation(ob)));
        setArchivedObligations([...completed, ...archivedData]);
      } else {
        setArchivedObligations(archivedData);
      }

      setObligations(active);
    } catch (err) {
      logError("failed to fetch obligations", err);
      setError("Failed to load obligations");
    } finally {
      setLoading(false);
    }
  }, [archiveObligation]);

  const fetchEscalationsForObligation = useCallback(async (obligationId: string) => {
    try {
      const res = await fetch(`/api/escalations?obligationId=${obligationId}`);
      if (!res.ok) return;
      const data = (await res.json()) as Escalation[];
      setEscalations((prev) => {
        const next = new Map(prev);
        next.set(obligationId, data);
        return next;
      });
    } catch (err) {
      logError("failed to fetch escalations", err);
    }
  }, []);

  function toggleEscalationExpanded(obligationId: string) {
    setExpandedEscalations((prev) => {
      const next = new Set(prev);
      if (next.has(obligationId)) {
        next.delete(obligationId);
      } else {
        next.add(obligationId);
        // Fetch escalations when expanding if not already loaded
        if (!escalations.has(obligationId)) {
          void fetchEscalationsForObligation(obligationId);
        }
      }
      return next;
    });
  }

  async function handleDeleteEscalation(escalationId: string, obligationId: string) {
    try {
      const res = await fetch(`/api/escalations/${escalationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete escalation rule");
        return;
      }
      setEscalations((prev) => {
        const next = new Map(prev);
        const current = next.get(obligationId) ?? [];
        next.set(obligationId, current.filter((e) => e.id !== escalationId));
        return next;
      });
    } catch (err) {
      logError("failed to delete escalation", err);
      setError("Failed to delete escalation rule");
    }
  }

  useEffect(() => {
    void fetchObligations();
  }, [fetchObligations]);

  async function handleTogglePause(id: string, isPaused: boolean) {
    try {
      const res = await fetch(`/api/obligations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused: !isPaused }),
      });
      if (!res.ok) {
        setError("Failed to update obligation");
        return;
      }
      setObligations((prev) =>
        prev.map((o) => (o.id === id ? { ...o, isPaused: !isPaused } : o))
      );
    } catch (err) {
      logError("failed to toggle pause for obligation", err);
      setError("Failed to update obligation");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/obligations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete obligation");
        return;
      }
      setObligations((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      logError("failed to delete obligation", err);
      setError("Failed to delete obligation");
    }
  }

  function handleEdit(id: string) {
    router.push(`/obligations/edit/${id}`);
  }

  function handleAdd() {
    router.push("/obligations/new");
  }

  const grouped = groupByFundGroup(obligations);
  const hasAnyObligations = obligations.length > 0 || archivedObligations.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title} data-testid="page-title">Obligations</h1>
          {obligations.length > 0 && (
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAdd}
            >
              Add obligation
            </button>
          )}
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading && <p className={styles.loading}>Loading...</p>}

        {!loading && !hasAnyObligations && !error && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No obligations yet</h2>
            <p className={styles.emptyDescription}>
              Add your first obligation to start tracking your expenses and
              building your sinking fund.
            </p>
            <button
              type="button"
              className={styles.emptyAddButton}
              onClick={handleAdd}
            >
              Add your first obligation
            </button>
          </div>
        )}

        {!loading &&
          obligations.length > 0 &&
          grouped.map((group) => (
            <div key={group.groupName} className={styles.groupSection}>
              {grouped.length > 1 && (
                <h2 className={styles.groupTitle}>{group.groupName}</h2>
              )}
              <ul className={styles.list}>
                {group.obligations.map((ob) => {
                  const isToggledOff = overrides.toggledOffIds.has(ob.id);
                  const amountOverride = overrides.amountOverrides.get(ob.id);
                  const pastDue = !ob.isPaused && isPastDue(ob.nextDueDate);
                  const classNames = [styles.listItem];
                  if (ob.isPaused) classNames.push(styles.listItemPaused);
                  if (pastDue) classNames.push(styles.listItemPastDue);
                  if (isToggledOff) classNames.push(styles.listItemToggledOff);

                  const freq = formatFrequency(ob.frequency, ob.frequencyDays);
                  const displayAmount = amountOverride ?? ob.amount;

                  return (
                    <li key={ob.id} className={classNames.join(" ")}>
                      <div className={styles.listItemInfo}>
                        <span className={styles.listItemName}>
                          {ob.name}
                          <span className={styles.typeBadge}>
                            {TYPE_LABELS[ob.type] ?? ob.type}
                          </span>
                          {ob.isPaused && (
                            <span className={styles.pausedBadge}>Paused</span>
                          )}
                          {pastDue && (
                            <span className={styles.pastDueBadge}>
                              Past due
                            </span>
                          )}
                          {isToggledOff && (
                            <span className={styles.whatIfBadge}>
                              What-if: off
                            </span>
                          )}
                          {amountOverride !== undefined && (
                            <span className={styles.whatIfBadge}>
                              What-if: ${amountOverride.toFixed(2)}
                            </span>
                          )}
                        </span>
                        <span className={styles.listItemDetail}>
                          ${displayAmount.toFixed(2)}
                          {freq && <> / {freq}</>}
                          {" · Due: "}
                          {formatDate(ob.nextDueDate)}
                          {ob.endDate && (
                            <> · Ends: {formatDate(ob.endDate)}</>
                          )}
                        </span>
                        {(() => {
                          const balance = ob.fundBalance?.currentBalance ?? 0;
                          const needed = ob.amount;
                          const pct = needed > 0 ? Math.min(100, Math.round((balance / needed) * 100)) : 100;
                          const color = getFundStatusColor(balance, needed);
                          return (
                            <div className={styles.fundBalanceRow} data-testid={`fund-balance-${ob.id}`}>
                              <div className={styles.fundProgressBar}>
                                <div
                                  className={`${styles.fundProgressFill} ${styles[`fundProgress_${color}`]}`}
                                  style={{ width: `${pct}%` }}
                                  data-testid={`fund-progress-${ob.id}`}
                                />
                              </div>
                              <span className={`${styles.fundBalanceText} ${styles[`fundText_${color}`]}`}>
                                ${balance.toFixed(2)} of ${needed.toFixed(2)} saved ({pct}%)
                              </span>
                              <button
                                type="button"
                                className={styles.contributeButton}
                                onClick={() => setContributionTarget(ob)}
                                data-testid={`contribute-button-${ob.id}`}
                              >
                                Record contribution
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                      <div className={styles.listItemActions}>
                        <label className={styles.whatIfToggle} data-testid={`whatif-toggle-${ob.id}`}>
                          <input
                            type="checkbox"
                            checked={!isToggledOff}
                            onChange={() => toggleObligation(ob.id)}
                            aria-label={`What-if toggle for ${ob.name}`}
                          />
                          <span className={styles.whatIfToggleLabel}>What-if</span>
                        </label>
                        <input
                          type="number"
                          className={styles.amountOverrideInput}
                          placeholder={ob.amount.toFixed(2)}
                          value={amountOverride !== undefined ? amountOverride : ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val >= 0) {
                              overrideAmount(ob.id, val);
                            }
                          }}
                          aria-label={`Amount override for ${ob.name}`}
                          data-testid={`amount-override-${ob.id}`}
                          step="0.01"
                          min="0"
                        />
                        <SparkleButton
                          item={{
                            id: ob.id,
                            name: ob.name,
                            amount: ob.amount,
                            frequency: ob.frequency,
                            type: "obligation",
                            obligationType: ob.type,
                          }}
                          onAction={() => void fetchObligations()}
                        />
                        <button
                          type="button"
                          className={styles.pauseButton}
                          onClick={() => void handleTogglePause(ob.id, ob.isPaused)}
                          aria-label={ob.isPaused ? `Resume ${ob.name}` : `Pause ${ob.name}`}
                        >
                          {ob.isPaused ? "Resume" : "Pause"}
                        </button>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => handleEdit(ob.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => void handleDelete(ob.id, ob.name)}
                          aria-label={`Delete ${ob.name}`}
                        >
                          Delete
                        </button>
                      </div>
                      {ob.type !== "one_off" && (
                        <div className={styles.escalationSection} data-testid={`escalation-section-${ob.id}`}>
                          <div className={styles.escalationHeader}>
                            <button
                              type="button"
                              className={styles.escalationToggle}
                              onClick={() => toggleEscalationExpanded(ob.id)}
                              aria-label={`Toggle escalation rules for ${ob.name}`}
                            >
                              {expandedEscalations.has(ob.id) ? "▾" : "▸"} Price changes
                              {escalations.has(ob.id) && escalations.get(ob.id)!.length > 0 && (
                                <span className={styles.escalationCount}>
                                  {escalations.get(ob.id)!.length}
                                </span>
                              )}
                            </button>
                          </div>
                          {expandedEscalations.has(ob.id) && (
                            <div className={styles.escalationBody}>
                              {escalations.has(ob.id) && escalations.get(ob.id)!.length > 0 ? (
                                <ul className={styles.escalationList}>
                                  {escalations.get(ob.id)!.map((esc) => (
                                    <li
                                      key={esc.id}
                                      className={`${styles.escalationItem} ${esc.isApplied ? styles.escalationItemApplied : ""}`}
                                      data-testid={`escalation-rule-${esc.id}`}
                                    >
                                      <div className={styles.escalationInfo}>
                                        <span className={styles.escalationDesc}>
                                          {formatEscalationDescription(esc)}
                                        </span>
                                        <span className={styles.escalationMeta}>
                                          {formatDate(esc.effectiveDate)} · {formatEscalationRecurrence(esc)}
                                          {esc.isApplied && (
                                            <span className={styles.appliedBadge}>Applied</span>
                                          )}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        className={styles.escalationDeleteButton}
                                        onClick={() => void handleDeleteEscalation(esc.id, ob.id)}
                                        aria-label={`Delete escalation rule ${esc.id}`}
                                      >
                                        Remove
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className={styles.escalationEmpty}>
                                  No price changes scheduled.
                                </p>
                              )}
                              {escalationFormTarget === ob.id ? (
                                <EscalationForm
                                  obligationId={ob.id}
                                  obligationName={ob.name}
                                  currentAmount={ob.amount}
                                  onSaved={() => {
                                    setEscalationFormTarget(null);
                                    void fetchEscalationsForObligation(ob.id);
                                  }}
                                  onCancel={() => setEscalationFormTarget(null)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className={styles.addEscalationButton}
                                  onClick={() => setEscalationFormTarget(ob.id)}
                                >
                                  Add price change
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

        {!loading && overrides.hypotheticals.length > 0 && (
          <div className={styles.hypotheticalSection}>
            <h2 className={styles.groupTitle}>Hypothetical obligations</h2>
            <ul className={styles.list}>
              {overrides.hypotheticals.map((hypo) => {
                const freq = formatFrequency(hypo.frequency, hypo.frequencyDays);
                return (
                  <li key={hypo.id} className={`${styles.listItem} ${styles.listItemHypothetical}`}>
                    <div className={styles.listItemInfo}>
                      <span className={styles.listItemName}>
                        {hypo.name}
                        <span className={styles.whatIfBadge}>Hypothetical</span>
                      </span>
                      <span className={styles.listItemDetail}>
                        ${hypo.amount.toFixed(2)}
                        {freq && <> / {freq}</>}
                        {" · Due: "}
                        {formatDate(hypo.nextDueDate.toISOString())}
                      </span>
                    </div>
                    <div className={styles.listItemActions}>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => removeHypothetical(hypo.id)}
                        aria-label={`Remove ${hypo.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!loading && obligations.length > 0 && (
          <div className={styles.hypotheticalActions}>
            {!showHypotheticalForm ? (
              <button
                type="button"
                className={styles.addHypotheticalButton}
                onClick={() => setShowHypotheticalForm(true)}
              >
                Add hypothetical obligation
              </button>
            ) : (
              <HypotheticalForm
                onAdd={(hypo) => {
                  addHypothetical(hypo);
                  setShowHypotheticalForm(false);
                }}
                onCancel={() => setShowHypotheticalForm(false)}
              />
            )}
          </div>
        )}

        {contributionTarget && (
          <ContributionModal
            obligationId={contributionTarget.id}
            obligationName={contributionTarget.name}
            currentBalance={contributionTarget.fundBalance?.currentBalance ?? 0}
            amountNeeded={contributionTarget.amount}
            recommendedContribution={Math.max(0, contributionTarget.amount - (contributionTarget.fundBalance?.currentBalance ?? 0))}
            onClose={() => setContributionTarget(null)}
            onSaved={() => {
              setContributionTarget(null);
              void fetchObligations();
            }}
          />
        )}

        {!loading && hasAnyObligations && (
          <div className={styles.archiveSection}>
            <h2 className={styles.archiveTitle}>Archived</h2>
            {archivedObligations.length === 0 ? (
              <p className={styles.archiveEmpty}>
                No archived obligations. Completed obligations will appear here.
              </p>
            ) : (
              <ul className={styles.list}>
                {archivedObligations.map((ob) => {
                  const freq = formatFrequency(ob.frequency, ob.frequencyDays);
                  return (
                    <li key={ob.id} className={`${styles.listItem} ${styles.listItemArchived}`}>
                      <div className={styles.listItemInfo}>
                        <span className={styles.listItemName}>
                          {ob.name}
                          <span className={styles.typeBadge}>
                            {TYPE_LABELS[ob.type] ?? ob.type}
                          </span>
                          <span className={styles.archivedBadge}>Archived</span>
                        </span>
                        <span className={styles.listItemDetail}>
                          ${ob.amount.toFixed(2)}
                          {freq && <> / {freq}</>}
                          {" · Due: "}
                          {formatDate(ob.nextDueDate)}
                          {ob.endDate && (
                            <> · Ends: {formatDate(ob.endDate)}</>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
