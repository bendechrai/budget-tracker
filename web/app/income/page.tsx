"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./income.module.css";
import { logError } from "@/lib/logging";
import SparkleButton from "@/app/components/SparkleButton";

interface IncomeSource {
  id: string;
  name: string;
  expectedAmount: number;
  frequency: string;
  frequencyDays: number | null;
  isIrregular: boolean;
  minimumExpected: number | null;
  nextExpectedDate: string | null;
  isPaused: boolean;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
  irregular: "Irregular",
};

function formatFrequency(frequency: string, frequencyDays: number | null): string {
  if (frequency === "custom" && frequencyDays) {
    return `Every ${frequencyDays} days`;
  }
  return FREQUENCY_LABELS[frequency] ?? frequency;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function IncomePage() {
  const router = useRouter();
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchIncomeSources = useCallback(async () => {
    try {
      const res = await fetch("/api/income-sources");
      if (!res.ok) {
        setError("Failed to load income sources");
        return;
      }
      const data = (await res.json()) as IncomeSource[];
      setIncomeSources(data);
    } catch (err) {
      logError("failed to fetch income sources", err);
      setError("Failed to load income sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIncomeSources();
  }, [fetchIncomeSources]);

  async function handleTogglePause(id: string, isPaused: boolean) {
    try {
      const res = await fetch(`/api/income-sources/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused: !isPaused }),
      });
      if (!res.ok) {
        setError("Failed to update income source");
        return;
      }
      setIncomeSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isPaused: !isPaused } : s))
      );
    } catch (err) {
      logError("failed to toggle pause for income source", err);
      setError("Failed to update income source");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/income-sources/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete income source");
        return;
      }
      setIncomeSources((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      logError("failed to delete income source", err);
      setError("Failed to delete income source");
    }
  }

  function handleEdit(id: string) {
    router.push(`/income/edit/${id}`);
  }

  function handleAdd() {
    router.push("/income/new");
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title} data-testid="page-title">Income Sources</h1>
          {incomeSources.length > 0 && (
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAdd}
            >
              Add income source
            </button>
          )}
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading && <p className={styles.loading}>Loading...</p>}

        {!loading && incomeSources.length === 0 && !error && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No income sources yet</h2>
            <p className={styles.emptyDescription}>
              Add your first income source to help calculate your contribution
              capacity.
            </p>
            <button
              type="button"
              className={styles.emptyAddButton}
              onClick={handleAdd}
            >
              Add your first income source
            </button>
          </div>
        )}

        {!loading && incomeSources.length > 0 && (
          <ul className={styles.list}>
            {incomeSources.map((source) => (
              <li
                key={source.id}
                className={`${styles.listItem}${source.isPaused ? ` ${styles.listItemPaused}` : ""}`}
              >
                <div className={styles.listItemInfo}>
                  <span className={styles.listItemName}>
                    {source.name}
                    {source.isPaused && (
                      <span className={styles.pausedBadge}>Paused</span>
                    )}
                  </span>
                  <span className={styles.listItemDetail}>
                    ${source.expectedAmount.toFixed(2)} /{" "}
                    {formatFrequency(source.frequency, source.frequencyDays)}
                    {source.nextExpectedDate && (
                      <> &middot; Next: {formatDate(source.nextExpectedDate)}</>
                    )}
                  </span>
                </div>
                <div className={styles.listItemActions}>
                  <SparkleButton
                    item={{
                      id: source.id,
                      name: source.name,
                      amount: source.expectedAmount,
                      frequency: source.frequency,
                      type: "income",
                    }}
                    onAction={() => void fetchIncomeSources()}
                  />
                  <button
                    type="button"
                    className={styles.pauseButton}
                    onClick={() => void handleTogglePause(source.id, source.isPaused)}
                    aria-label={source.isPaused ? `Resume ${source.name}` : `Pause ${source.name}`}
                  >
                    {source.isPaused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className={styles.editButton}
                    onClick={() => handleEdit(source.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => void handleDelete(source.id, source.name)}
                    aria-label={`Delete ${source.name}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
