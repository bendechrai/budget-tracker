"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "./nudge.module.css";
import { logError } from "@/lib/logging";

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
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "weekly",
  fortnightly: "fortnightly",
  twice_monthly: "twice-monthly",
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "annual",
  custom: "custom",
  irregular: "irregular",
};

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function NudgeCards() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) return;
      const data = (await res.json()) as {
        suggestions: Suggestion[];
        count: number;
      };
      const highConfidence = data.suggestions.filter(
        (s) => s.confidence === "high"
      );
      setSuggestions(highConfidence);
    } catch (err) {
      logError("failed to fetch nudge suggestions", err);
    }
  }, []);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  async function handleDismiss(id: string) {
    setDismissing(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      logError("failed to dismiss nudge suggestion", err);
    } finally {
      setDismissing(null);
    }
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={styles.nudgeSection} data-testid="nudge-cards">
      {suggestions.map((suggestion) => {
        const freq =
          FREQUENCY_LABELS[suggestion.detectedFrequency] ??
          suggestion.detectedFrequency;
        const typeLabel =
          suggestion.type === "income" ? "income" : "charge";

        return (
          <div key={suggestion.id} className={styles.nudgeCard}>
            <div className={styles.nudgeContent}>
              <p className={styles.nudgeText}>
                We noticed a new{" "}
                <span className={styles.nudgeAmount}>
                  {formatAmount(suggestion.detectedAmount)}
                </span>{" "}
                {freq} {typeLabel} from {suggestion.vendorPattern}.
              </p>
              <div className={styles.nudgeMeta}>
                <Link href="/suggestions" className={styles.nudgeLink}>
                  Review
                </Link>
              </div>
            </div>
            <button
              type="button"
              className={styles.dismissButton}
              aria-label={`Dismiss ${suggestion.vendorPattern}`}
              disabled={dismissing === suggestion.id}
              onClick={() => void handleDismiss(suggestion.id)}
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
