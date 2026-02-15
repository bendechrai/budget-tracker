"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./suggestions.module.css";
import { logError } from "@/lib/logging";
import { useSuggestionsCount } from "@/app/contexts/SuggestionsCountContext";

interface SuggestionTransaction {
  transaction: {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
  };
}

interface Suggestion {
  id: string;
  type: "income" | "expense";
  vendorPattern: string;
  detectedAmount: number;
  detectedAmountMin: number | null;
  detectedAmountMax: number | null;
  detectedFrequency: string;
  confidence: "high" | "medium" | "low";
  matchingTransactionCount: number;
  status: string;
  suggestionTransactions: SuggestionTransaction[];
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  twice_monthly: "Twice monthly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
  irregular: "Irregular",
};

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "twice_monthly", label: "Twice monthly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
  { value: "irregular", label: "Irregular" },
];

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatAmountRange(
  amount: number,
  min: number | null,
  max: number | null
): string {
  if (min !== null && max !== null && min !== max) {
    return `${formatAmount(min)} – ${formatAmount(max)}`;
  }
  return formatAmount(amount);
}

function computeAverageCadence(dates: string[]): string | null {
  if (dates.length < 2) return null;

  const sorted = [...dates]
    .map((d) => new Date(d).getTime())
    .sort((a, b) => a - b);

  let totalDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDays += (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24);
  }
  const avgDays = totalDays / (sorted.length - 1);

  if (avgDays < 10) {
    return `~every ${Math.round(avgDays)} days`;
  }
  if (avgDays < 42) {
    return `~every ${Math.round(avgDays / 7)} weeks`;
  }
  return `~every ${Math.round(avgDays / 30)} months`;
}

function formatTransactionDate(dateStr: string): string {
  const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  const [year, month, day] = datePart.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tweakingId, setTweakingId] = useState<string | null>(null);
  const [tweakName, setTweakName] = useState("");
  const [tweakAmount, setTweakAmount] = useState("");
  const [tweakFrequency, setTweakFrequency] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { decrement } = useSuggestionsCount();

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) {
        setError("Failed to load suggestions");
        return;
      }
      const data = (await res.json()) as {
        suggestions: Suggestion[];
        count: number;
      };
      setSuggestions(data.suggestions);
    } catch (err) {
      logError("failed to fetch suggestions", err);
      setError("Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  async function handleAccept(id: string) {
    setActionLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (!res.ok) {
        setError("Failed to accept suggestion");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      decrement();
    } catch (err) {
      logError("failed to accept suggestion", err);
      setError("Failed to accept suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDismiss(id: string) {
    setActionLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) {
        setError("Failed to dismiss suggestion");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      decrement();
    } catch (err) {
      logError("failed to dismiss suggestion", err);
      setError("Failed to dismiss suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  function handleStartTweak(suggestion: Suggestion) {
    setTweakingId(suggestion.id);
    setTweakName(suggestion.vendorPattern);
    setTweakAmount(suggestion.detectedAmount.toString());
    setTweakFrequency(suggestion.detectedFrequency);
  }

  function handleCancelTweak() {
    setTweakingId(null);
    setTweakName("");
    setTweakAmount("");
    setTweakFrequency("");
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSaveTweak(id: string) {
    const parsedAmount = parseFloat(tweakAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Amount must be a non-negative number");
      return;
    }

    const trimmedName = tweakName.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setActionLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          name: trimmedName,
          amount: parsedAmount,
          frequency: tweakFrequency,
        }),
      });
      if (!res.ok) {
        setError("Failed to save suggestion");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      decrement();
      handleCancelTweak();
    } catch (err) {
      logError("failed to save tweaked suggestion", err);
      setError("Failed to save suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title} data-testid="page-title">Suggestions</h1>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading && <p className={styles.loading}>Loading...</p>}

        {!loading && suggestions.length === 0 && !error && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No new suggestions</h2>
            <p className={styles.emptyDescription}>
              No new patterns detected. You can add income and expenses
              manually, or import more bank statements to detect patterns.
            </p>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <ul className={styles.list}>
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.vendorName}>
                    {suggestion.vendorPattern}
                  </span>
                  <span
                    className={`${styles.typeBadge} ${
                      suggestion.type === "income"
                        ? styles.typeBadgeIncome
                        : styles.typeBadgeExpense
                    }`}
                  >
                    {suggestion.type === "income" ? "Income" : "Expense"}
                  </span>
                </div>

                <div className={styles.cardDetails}>
                  <span className={styles.cardDetail}>
                    {formatAmountRange(
                      suggestion.detectedAmount,
                      suggestion.detectedAmountMin,
                      suggestion.detectedAmountMax
                    )}
                  </span>
                  <span className={styles.cardDetail}>
                    {FREQUENCY_LABELS[suggestion.detectedFrequency] ??
                      suggestion.detectedFrequency}
                  </span>
                  <span
                    className={`${styles.confidenceBadge} ${
                      suggestion.confidence === "high"
                        ? styles.confidenceHigh
                        : suggestion.confidence === "medium"
                          ? styles.confidenceMedium
                          : styles.confidenceLow
                    }`}
                  >
                    {suggestion.confidence} confidence
                  </span>
                  <button
                    type="button"
                    className={styles.transactionToggle}
                    onClick={() => toggleExpanded(suggestion.id)}
                    aria-label={`Toggle transactions for ${suggestion.vendorPattern}`}
                  >
                    {expandedIds.has(suggestion.id) ? "▾" : "▸"}{" "}
                    {suggestion.matchingTransactionCount} transactions
                  </button>
                </div>

                {expandedIds.has(suggestion.id) && (
                  <div className={styles.transactionList}>
                    {suggestion.suggestionTransactions
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.transaction.date).getTime() -
                          new Date(b.transaction.date).getTime()
                      )
                      .map((st) => (
                        <div
                          key={st.transaction.id}
                          className={styles.transactionRow}
                        >
                          <span>{formatTransactionDate(st.transaction.date)}</span>
                          <span>{st.transaction.description}</span>
                          <span>{formatAmount(st.transaction.amount)}</span>
                        </div>
                      ))}
                    {suggestion.detectedFrequency === "irregular" && (() => {
                      const cadence = computeAverageCadence(
                        suggestion.suggestionTransactions.map(
                          (st) => st.transaction.date
                        )
                      );
                      return cadence ? (
                        <p className={styles.cadenceLine}>{cadence}</p>
                      ) : null;
                    })()}
                    {suggestion.detectedAmountMin === null &&
                      suggestion.suggestionTransactions.length > 1 &&
                      new Set(
                        suggestion.suggestionTransactions.map(
                          (st) => st.transaction.amount
                        )
                      ).size > 1 && (
                        <p className={styles.cadenceLine}>
                          Amounts vary slightly — average shown above
                        </p>
                      )}
                  </div>
                )}

                {tweakingId === suggestion.id ? (
                  <div className={styles.tweakForm}>
                    <div className={styles.tweakFieldRow}>
                      <div className={styles.tweakField}>
                        <label
                          className={styles.tweakLabel}
                          htmlFor={`tweak-name-${suggestion.id}`}
                        >
                          Name
                        </label>
                        <input
                          id={`tweak-name-${suggestion.id}`}
                          className={styles.tweakInput}
                          type="text"
                          value={tweakName}
                          onChange={(e) => setTweakName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.tweakFieldRow}>
                      <div className={styles.tweakField}>
                        <label
                          className={styles.tweakLabel}
                          htmlFor={`tweak-amount-${suggestion.id}`}
                        >
                          Amount
                        </label>
                        <input
                          id={`tweak-amount-${suggestion.id}`}
                          className={styles.tweakInput}
                          type="number"
                          min="0"
                          step="0.01"
                          value={tweakAmount}
                          onChange={(e) => setTweakAmount(e.target.value)}
                        />
                      </div>
                      <div className={styles.tweakField}>
                        <label
                          className={styles.tweakLabel}
                          htmlFor={`tweak-frequency-${suggestion.id}`}
                        >
                          Frequency
                        </label>
                        <select
                          id={`tweak-frequency-${suggestion.id}`}
                          className={styles.tweakInput}
                          value={tweakFrequency}
                          onChange={(e) => setTweakFrequency(e.target.value)}
                        >
                          {FREQUENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className={styles.tweakActions}>
                      <button
                        type="button"
                        className={styles.tweakCancelButton}
                        onClick={handleCancelTweak}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.tweakSaveButton}
                        disabled={actionLoading === suggestion.id}
                        onClick={() => void handleSaveTweak(suggestion.id)}
                      >
                        {actionLoading === suggestion.id
                          ? "Saving..."
                          : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.acceptButton}
                      disabled={actionLoading === suggestion.id}
                      onClick={() => void handleAccept(suggestion.id)}
                    >
                      {actionLoading === suggestion.id
                        ? "Accepting..."
                        : "Accept"}
                    </button>
                    <button
                      type="button"
                      className={styles.tweakButton}
                      onClick={() => handleStartTweak(suggestion)}
                    >
                      Tweak
                    </button>
                    <button
                      type="button"
                      className={styles.dismissButton}
                      disabled={actionLoading === suggestion.id}
                      onClick={() => void handleDismiss(suggestion.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
