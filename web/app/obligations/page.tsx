"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./obligations.module.css";
import { logError } from "@/lib/logging";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchObligations = useCallback(async () => {
    try {
      const res = await fetch("/api/obligations");
      if (!res.ok) {
        setError("Failed to load obligations");
        return;
      }
      const data = (await res.json()) as Obligation[];
      setObligations(data);
    } catch (err) {
      logError("failed to fetch obligations", err);
      setError("Failed to load obligations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchObligations();
  }, [fetchObligations]);

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

        {!loading && obligations.length === 0 && !error && (
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

        {!loading && obligations.length > 0 && (
          <div className={styles.archiveSection}>
            <h2 className={styles.archiveTitle}>Archived</h2>
            <p className={styles.archiveEmpty}>
              No archived obligations. Completed obligations will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
