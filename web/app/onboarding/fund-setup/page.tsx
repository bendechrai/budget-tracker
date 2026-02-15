"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../onboarding.module.css";
import fundStyles from "./fund-setup.module.css";

const CYCLE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "twice_monthly", label: "Twice monthly" },
  { value: "monthly", label: "Monthly" },
];

const CURRENCY_QUICK_PICKS = ["$", "\u00a3", "\u20ac", "\u00a5", "A$", "NZ$"];

export default function OnboardingFundSetupPage() {
  const router = useRouter();
  const [currentBalance, setCurrentBalance] = useState("");
  const [maxContribution, setMaxContribution] = useState("");
  const [cycleType, setCycleType] = useState("fortnightly");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [customCurrency, setCustomCurrency] = useState("");
  const [notSure, setNotSure] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const balance = parseFloat(currentBalance || "0");
    if (isNaN(balance) || balance < 0) {
      setError("Balance must be zero or a positive number");
      return;
    }

    if (!notSure) {
      const contribution = parseFloat(maxContribution);
      if (isNaN(contribution) || contribution <= 0) {
        setError("Contribution amount must be a positive number");
        return;
      }
    }

    if (!currencySymbol.trim()) {
      setError("Currency symbol is required");
      return;
    }

    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        currentFundBalance: balance,
        currencySymbol: currencySymbol.trim(),
      };

      if (!notSure) {
        body.maxContributionPerCycle = parseFloat(maxContribution);
        body.contributionCycleType = cycleType;
      }

      const res = await fetch("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error || "Something went wrong. Please try again."
        );
        setSubmitting(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function handleCurrencyPick(symbol: string) {
    setCurrencySymbol(symbol);
    setCustomCurrency("");
  }

  function handleCustomCurrencySet() {
    const value = customCurrency.trim();
    if (value) {
      setCurrencySymbol(value);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Fund Setup</h1>
        <p className={styles.subtitle}>
          Almost done! Tell us about your current savings and how much you can
          set aside each cycle. You can always change these later.
        </p>

        <form className={fundStyles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={fundStyles.error} role="alert">
              {error}
            </div>
          )}

          <div className={fundStyles.field}>
            <label className={fundStyles.label} htmlFor="fund-balance">
              Current fund balance
            </label>
            <span className={fundStyles.hint}>
              How much do you already have set aside for bills and expenses?
            </span>
            <input
              id="fund-balance"
              className={fundStyles.input}
              type="number"
              min="0"
              step="0.01"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className={fundStyles.field}>
            <label className={fundStyles.label} htmlFor="max-contribution">
              Max contribution per cycle
            </label>
            <span className={fundStyles.hint}>
              The most you can set aside each pay cycle for your sinking fund.
            </span>
            <input
              id="max-contribution"
              className={fundStyles.input}
              type="number"
              min="0.01"
              step="0.01"
              value={maxContribution}
              onChange={(e) => setMaxContribution(e.target.value)}
              placeholder="0.00"
              disabled={notSure}
            />
          </div>

          <div className={fundStyles.checkboxRow}>
            <input
              id="not-sure"
              className={fundStyles.checkbox}
              type="checkbox"
              checked={notSure}
              onChange={(e) => {
                setNotSure(e.target.checked);
                if (e.target.checked) {
                  setMaxContribution("");
                  setCycleType("fortnightly");
                }
              }}
            />
            <label className={fundStyles.checkboxLabel} htmlFor="not-sure">
              I&apos;m not sure yet
            </label>
          </div>

          <div className={fundStyles.field}>
            <span className={fundStyles.label}>Contribution cycle</span>
            <span className={fundStyles.hint}>
              How often do you get paid?
            </span>
            <div
              className={fundStyles.cycleOptions}
              role="radiogroup"
              aria-label="Contribution cycle"
            >
              {CYCLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`${fundStyles.cycleOption}${cycleType === opt.value ? ` ${fundStyles.cycleOptionActive}` : ""}`}
                >
                  <input
                    type="radio"
                    name="cycle"
                    value={opt.value}
                    checked={cycleType === opt.value}
                    onChange={() => setCycleType(opt.value)}
                    disabled={notSure}
                    className={fundStyles.radioInput}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className={fundStyles.field}>
            <span className={fundStyles.label}>Currency symbol</span>
            <div className={fundStyles.currencyPicks}>
              {CURRENCY_QUICK_PICKS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className={`${fundStyles.currencyPick}${currencySymbol === sym ? ` ${fundStyles.currencyPickActive}` : ""}`}
                  onClick={() => handleCurrencyPick(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
            <div className={fundStyles.inlineForm}>
              <input
                className={fundStyles.input}
                type="text"
                value={customCurrency}
                onChange={(e) => setCustomCurrency(e.target.value)}
                placeholder="Custom symbol"
                maxLength={5}
              />
              <button
                type="button"
                className={fundStyles.setButton}
                onClick={handleCustomCurrencySet}
              >
                Set
              </button>
            </div>
          </div>

          <div className={fundStyles.actions}>
            <button
              type="submit"
              className={fundStyles.submitButton}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Finish Setup"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
