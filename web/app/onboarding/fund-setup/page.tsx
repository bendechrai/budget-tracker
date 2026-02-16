"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../onboarding.module.css";
import fundStyles from "./fund-setup.module.css";

const CURRENCY_QUICK_PICKS = ["$", "\u00a3", "\u20ac", "\u00a5", "A$", "NZ$"];

export default function OnboardingFundSetupPage() {
  const router = useRouter();
  const [currentBalance, setCurrentBalance] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [customCurrency, setCustomCurrency] = useState("");
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
          Almost done! Tell us about your current savings. You can always
          change these later.
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
