"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./obligations.module.css";
import { logError } from "@/lib/logging";
import SparkleButton from "@/app/components/SparkleButton";

interface FundGroup {
  id: string;
  name: string;
}

interface CustomScheduleEntry {
  id: string;
  dueDate: string;
  amount: number;
  isPaid: boolean;
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
  });
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
          <h1 className={styles.title}>Obligations</h1>
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
                  const pastDue = !ob.isPaused && isPastDue(ob.nextDueDate);
                  const classNames = [styles.listItem];
                  if (ob.isPaused) classNames.push(styles.listItemPaused);
                  if (pastDue) classNames.push(styles.listItemPastDue);

                  const freq = formatFrequency(ob.frequency, ob.frequencyDays);

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
                      <div className={styles.listItemActions}>
                        <SparkleButton
                          item={{
                            id: ob.id,
                            name: ob.name,
                            amount: ob.amount,
                            frequency: ob.frequency,
                            type: "obligation",
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
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

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
