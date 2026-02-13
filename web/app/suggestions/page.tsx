"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./suggestions.module.css";
import { logError } from "@/lib/logging";

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
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
  irregular: "Irregular",
};

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
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

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tweakingId, setTweakingId] = useState<string | null>(null);
  const [tweakName, setTweakName] = useState("");
  const [tweakAmount, setTweakAmount] = useState("");
  const [tweakFrequency, setTweakFrequency] = useState("");

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
                  <span className={styles.cardDetail}>
                    {suggestion.matchingTransactionCount} transactions
                  </span>
                </div>

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
