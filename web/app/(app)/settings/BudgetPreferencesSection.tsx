"use client";

import { useState, type FormEvent } from "react";
import { logError } from "@/lib/logging";
import styles from "./settings.module.css";

interface AutoDetectedCycle {
  type: "weekly" | "fortnightly" | "twice_monthly" | "monthly";
  payDays: number[];
}

interface BudgetPreferencesSectionProps {
  contributionCycleType: "weekly" | "fortnightly" | "twice_monthly" | "monthly" | null;
  contributionPayDays: number[];
  currencySymbol: string;
  autoDetectedCycle: AutoDetectedCycle;
  onSettingsChange: (updated: {
    contributionCycleType: BudgetPreferencesSectionProps["contributionCycleType"];
    contributionPayDays: number[];
    currencySymbol: string;
  }) => void;
}

const CYCLE_OPTIONS: { value: string; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "twice_monthly", label: "Twice monthly" },
  { value: "monthly", label: "Monthly" },
];

const CURRENCY_QUICK_PICKS = ["$", "\u00a3", "\u20ac", "\u00a5", "A$", "NZ$"];

function cycleLabel(type: string): string {
  return CYCLE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export default function BudgetPreferencesSection({
  contributionCycleType,
  currencySymbol,
  autoDetectedCycle,
  onSettingsChange,
}: BudgetPreferencesSectionProps) {
  const [budgetError, setBudgetError] = useState("");
  const [budgetSuccess, setBudgetSuccess] = useState("");
  const [budgetSubmitting, setBudgetSubmitting] = useState(false);

  async function handleBudgetSave(field: string, value: unknown) {
    setBudgetError("");
    setBudgetSuccess("");
    setBudgetSubmitting(true);

    try {
      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setBudgetError(data.error || "Failed to save");
        return;
      }

      const data = (await res.json()) as {
        contributionCycleType: BudgetPreferencesSectionProps["contributionCycleType"];
        contributionPayDays: number[];
        currencySymbol: string;
      };
      onSettingsChange(data);
      setBudgetSuccess("Saved");
    } catch (err) {
      logError("failed to save budget setting", err);
      setBudgetError("Failed to save");
    } finally {
      setBudgetSubmitting(false);
    }
  }

  function handleCycleChange(value: string) {
    if (value === "auto") {
      void handleBudgetSave("contributionCycleType", null);
    } else {
      void handleBudgetSave("contributionCycleType", value);
    }
  }

  function handleCurrencyPick(symbol: string) {
    void handleBudgetSave("currencySymbol", symbol);
  }

  function handleCurrencyInput(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("currency-custom") as HTMLInputElement;
    const value = input.value.trim();
    if (value) {
      void handleBudgetSave("currencySymbol", value);
    }
  }

  const activeCycle = contributionCycleType ?? "auto";

  return (
    <>
      {budgetError && (
        <div className={styles.formError} role="alert">
          {budgetError}
        </div>
      )}

      {budgetSuccess && (
        <div className={styles.formSuccess} role="status">
          {budgetSuccess}
        </div>
      )}

      <div className={styles.form}>
        <h3 className={styles.formTitle}>Contribution Cycle</h3>

        {autoDetectedCycle && (
          <p className={styles.recommendation}>
            Recommended: <strong>{cycleLabel(autoDetectedCycle.type)}</strong> (based on your income sources)
          </p>
        )}

        <div className={styles.cycleOptions} role="radiogroup" aria-label="Contribution cycle">
          <label
            className={`${styles.cycleOption} ${activeCycle === "auto" ? styles.cycleOptionActive : ""}`}
          >
            <input
              type="radio"
              name="cycle"
              value="auto"
              checked={activeCycle === "auto"}
              onChange={() => handleCycleChange("auto")}
              disabled={budgetSubmitting}
              className={styles.radioInput}
            />
            Auto-detect
          </label>
          {CYCLE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`${styles.cycleOption} ${activeCycle === opt.value ? styles.cycleOptionActive : ""}`}
            >
              <input
                type="radio"
                name="cycle"
                value={opt.value}
                checked={activeCycle === opt.value}
                onChange={() => handleCycleChange(opt.value)}
                disabled={budgetSubmitting}
                className={styles.radioInput}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.form}>
        <h3 className={styles.formTitle}>Currency Symbol</h3>

        <div className={styles.currencyPicks}>
          {CURRENCY_QUICK_PICKS.map((sym) => (
            <button
              key={sym}
              type="button"
              className={`${styles.currencyPick} ${currencySymbol === sym ? styles.currencyPickActive : ""}`}
              onClick={() => handleCurrencyPick(sym)}
              disabled={budgetSubmitting}
            >
              {sym}
            </button>
          ))}
        </div>

        <form
          className={styles.inlineForm}
          onSubmit={(e) => handleCurrencyInput(e)}
        >
          <input
            id="currency-custom"
            name="currency-custom"
            className={styles.input}
            type="text"
            defaultValue={
              CURRENCY_QUICK_PICKS.includes(currencySymbol)
                ? ""
                : currencySymbol
            }
            placeholder="Custom symbol"
            maxLength={5}
          />
          <button
            type="submit"
            className={styles.submitButton}
            disabled={budgetSubmitting}
          >
            Set
          </button>
        </form>
      </div>

    </>
  );
}
