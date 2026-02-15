"use client";

import { useState, useMemo, FormEvent } from "react";
import styles from "./escalation-form.module.css";
import { logError } from "@/lib/logging";

interface EscalationFormProps {
  obligationId: string;
  obligationName: string;
  currentAmount: number;
  onSaved: () => void;
  onCancel: () => void;
}

type ChangeType = "absolute" | "percentage" | "fixed_increase";

const CHANGE_TYPE_OPTIONS: { value: ChangeType; label: string }[] = [
  { value: "absolute", label: "Set to amount" },
  { value: "percentage", label: "Percentage increase" },
  { value: "fixed_increase", label: "Fixed increase" },
];

function computePreview(
  currentAmount: number,
  changeType: ChangeType,
  value: number,
  effectiveDate: string,
  isRecurring: boolean,
  intervalMonths: number,
): { date: string; amount: number }[] {
  if (!effectiveDate || isNaN(value)) return [];

  const steps: { date: string; amount: number }[] = [];
  let amount = currentAmount;
  const maxSteps = isRecurring ? 5 : 1;

  const start = new Date(effectiveDate + "T00:00:00");
  if (isNaN(start.getTime())) return [];

  for (let i = 0; i < maxSteps; i++) {
    const date = new Date(start);
    if (i > 0) {
      date.setUTCMonth(date.getUTCMonth() + intervalMonths * i);
    }

    if (changeType === "absolute") {
      amount = value;
    } else if (changeType === "percentage") {
      amount = amount * (1 + value / 100);
    } else {
      amount = amount + value;
    }

    steps.push({
      date: date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      amount: Math.round(amount * 100) / 100,
    });

    // Absolute is always one-off
    if (changeType === "absolute") break;
    if (!isRecurring) break;
  }

  return steps;
}

export default function EscalationForm({
  obligationId,
  obligationName,
  currentAmount,
  onSaved,
  onCancel,
}: EscalationFormProps) {
  const [changeType, setChangeType] = useState<ChangeType>("percentage");
  const [value, setValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [intervalMonths, setIntervalMonths] = useState("12");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Absolute is one-off only, so disable recurring for absolute
  const effectiveIsRecurring = changeType === "absolute" ? false : isRecurring;
  const parsedValue = parseFloat(value);
  const parsedInterval = parseInt(intervalMonths, 10);

  const preview = useMemo(
    () =>
      computePreview(
        currentAmount,
        changeType,
        parsedValue,
        effectiveDate,
        effectiveIsRecurring,
        parsedInterval || 12,
      ),
    [currentAmount, changeType, parsedValue, effectiveDate, effectiveIsRecurring, parsedInterval],
  );

  function isLargeIncrease(): boolean {
    if (changeType === "percentage" && parsedValue > 50) return true;
    if (
      changeType === "fixed_increase" &&
      currentAmount > 0 &&
      parsedValue > currentAmount * 0.5
    )
      return true;
    return false;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (isNaN(parsedValue) || parsedValue < 0) {
      setError("Value must be a non-negative number");
      return;
    }

    if (!effectiveDate) {
      setError("Effective date is required");
      return;
    }

    const dateObj = new Date(effectiveDate + "T00:00:00");
    if (isNaN(dateObj.getTime())) {
      setError("Invalid date");
      return;
    }

    if (effectiveIsRecurring && (isNaN(parsedInterval) || parsedInterval <= 0)) {
      setError("Interval must be a positive number");
      return;
    }

    if (
      isLargeIncrease() &&
      !confirm("This will increase the amount by more than 50%. Is that right?")
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId,
          changeType,
          value: parsedValue,
          effectiveDate: effectiveDate,
          intervalMonths: effectiveIsRecurring ? parsedInterval : null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to save escalation");
        return;
      }

      onSaved();
    } catch (err) {
      logError("failed to save escalation", err);
      setError("Failed to save escalation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container} data-testid="escalation-form">
      <h3 className={styles.title}>
        Add price change for {obligationName}
      </h3>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="escalation-change-type">
            Change type
          </label>
          <select
            id="escalation-change-type"
            className={styles.input}
            value={changeType}
            onChange={(e) => setChangeType(e.target.value as ChangeType)}
          >
            {CHANGE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="escalation-value">
              {changeType === "absolute"
                ? "New amount"
                : changeType === "percentage"
                  ? "Percentage"
                  : "Increase by"}
            </label>
            <input
              id="escalation-value"
              className={styles.input}
              type="number"
              min="0"
              step={changeType === "percentage" ? "0.1" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={changeType === "percentage" ? "e.g. 3" : "e.g. 50"}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="escalation-effective-date">
              Effective date
            </label>
            <input
              id="escalation-effective-date"
              className={styles.input}
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
        </div>

        {changeType !== "absolute" && (
          <div className={styles.recurringToggle}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                data-testid="recurring-toggle"
              />
              <span>Repeats every</span>
            </label>
            {isRecurring && (
              <div className={styles.intervalField}>
                <input
                  id="escalation-interval"
                  className={styles.intervalInput}
                  type="number"
                  min="1"
                  step="1"
                  value={intervalMonths}
                  onChange={(e) => setIntervalMonths(e.target.value)}
                  aria-label="Interval months"
                />
                <span className={styles.intervalSuffix}>months</span>
              </div>
            )}
          </div>
        )}

        {preview.length > 0 && (
          <div className={styles.preview} data-testid="escalation-preview">
            <h4 className={styles.previewTitle}>Preview</h4>
            <div className={styles.previewCurrent}>
              Current: ${currentAmount.toFixed(2)}
            </div>
            <ul className={styles.previewList}>
              {preview.map((step, idx) => (
                <li key={idx} className={styles.previewItem}>
                  <span className={styles.previewDate}>{step.date}</span>
                  <span className={styles.previewAmount}>
                    ${step.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Save price change"}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
