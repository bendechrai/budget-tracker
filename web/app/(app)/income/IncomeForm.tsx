"use client";

import { useState, FormEvent } from "react";
import styles from "./income-form.module.css";

export interface IncomeFormData {
  name: string;
  expectedAmount: number;
  intervalUnit: string | null;
  intervalCount: number;
  minimumExpected: number | null;
  nextExpectedDate: string | null;
}

interface IncomeFormProps {
  initialData?: IncomeFormData;
  onSubmit: (data: IncomeFormData) => Promise<void>;
  submitLabel: string;
}

const INTERVAL_UNIT_OPTIONS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "twice_monthly", label: "twice monthly" },
  { value: "month", label: "months" },
  { value: "quarter", label: "quarters" },
  { value: "year", label: "years" },
];

export default function IncomeForm({
  initialData,
  onSubmit,
  submitLabel,
}: IncomeFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    initialData?.expectedAmount?.toString() ?? ""
  );
  const [intervalUnit, setIntervalUnit] = useState(
    initialData?.intervalUnit ?? "month"
  );
  const [intervalCount, setIntervalCount] = useState(
    initialData?.intervalCount?.toString() ?? "1"
  );
  const [nextExpectedDate, setNextExpectedDate] = useState(
    initialData?.nextExpectedDate ?? ""
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    const parsedAmount = parseFloat(expectedAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Expected amount must be a non-negative number");
      return;
    }

    const ic = parseInt(intervalCount, 10);
    if (isNaN(ic) || ic <= 0) {
      setError("Interval count must be a positive number");
      return;
    }

    const data: IncomeFormData = {
      name: trimmedName,
      expectedAmount: parsedAmount,
      intervalUnit,
      intervalCount: ic,
      minimumExpected: null,
      nextExpectedDate: nextExpectedDate || null,
    };

    setSubmitting(true);
    try {
      await onSubmit(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="income-name">
          Name
        </label>
        <input
          id="income-name"
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Salary, Freelance"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="income-amount">
          Expected Amount
        </label>
        <input
          id="income-amount"
          className={styles.input}
          type="number"
          min="0"
          step="0.01"
          value={expectedAmount}
          onChange={(e) => setExpectedAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Frequency</label>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="income-interval-count">
              Every
            </label>
            <input
              id="income-interval-count"
              className={styles.input}
              type="number"
              min="1"
              step="1"
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="income-interval-unit">
              Unit
            </label>
            <select
              id="income-interval-unit"
              className={styles.input}
              value={intervalUnit}
              onChange={(e) => setIntervalUnit(e.target.value)}
            >
              {INTERVAL_UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.helperText}>
          If your income varies, enter a conservative estimate for the amount
          and period you can count on.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="income-next-date">
          Next Expected Date
        </label>
        <input
          id="income-next-date"
          className={styles.input}
          type="date"
          value={nextExpectedDate}
          onChange={(e) => setNextExpectedDate(e.target.value)}
        />
      </div>

      <button
        type="submit"
        className={styles.submitButton}
        disabled={submitting}
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
