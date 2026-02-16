"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "./suggestions-card.module.css";
import { logError } from "@/lib/logging";

interface Suggestion {
  id: string;
  type: "income" | "expense";
  vendorPattern: string;
  detectedAmount: number;
  detectedIntervalUnit: string | null;
  detectedIntervalCount: number;
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function frequencyShort(unit: string | null, count: number): string {
  if (!unit) return "";
  if (count === 1) {
    switch (unit) {
      case "day": return "/day";
      case "week": return "/wk";
      case "twice_monthly": return "/2wk";
      case "month": return "/mo";
      case "quarter": return "/qtr";
      case "year": return "/yr";
      default: return "";
    }
  }
  const plurals: Record<string, string> = {
    day: "days",
    week: "wks",
    month: "mos",
    quarter: "qtrs",
    year: "yrs",
  };
  return `/${count}${plurals[unit] ?? unit}`;
}

export default function SuggestionsCard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) return;
      const data = (await res.json()) as {
        suggestions: Suggestion[];
        count: number;
      };
      setSuggestions(data.suggestions.slice(0, 5));
    } catch (err) {
      logError("failed to fetch suggestions for card", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  if (!loaded) return null;

  return (
    <div className={styles.card} data-testid="suggestions-card">
      <h3 className={styles.heading}>Suggestions</h3>
      {suggestions.length === 0 ? (
        <p className={styles.empty} data-testid="suggestions-empty">
          No new suggestions
        </p>
      ) : (
        <>
          <ul className={styles.list}>
            {suggestions.map((s) => (
              <li key={s.id} className={styles.row}>
                <span className={styles.vendor}>{s.vendorPattern}</span>
                <span className={styles.detail}>
                  {formatAmount(s.detectedAmount)}
                  {frequencyShort(s.detectedIntervalUnit, s.detectedIntervalCount)}
                  {" \u2014 "}
                  {s.type}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/suggestions" className={styles.viewAll} data-testid="suggestions-view-all">
            View all suggestions &rarr;
          </Link>
        </>
      )}
    </div>
  );
}
