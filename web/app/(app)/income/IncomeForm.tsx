"use client";

import { useState, FormEvent } from "react";
import styles from "./income-form.module.css";

export interface IncomeFormData {
  name: string;
  expectedAmount: number;
  frequency: string;
  frequencyDays: number | null;
  isIrregular: boolean;
  minimumExpected: number | null;
  nextExpectedDate: string | null;
}

interface IncomeFormProps {
  initialData?: IncomeFormData;
  onSubmit: (data: IncomeFormData) => Promise<void>;
  submitLabel: string;
}

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

export default function IncomeForm({
  initialData,
  onSubmit,
  submitLabel,
}: IncomeFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    initialData?.expectedAmount?.toString() ?? ""
  );
  const [frequency, setFrequency] = useState(
    initialData?.frequency ?? "monthly"
  );
  const [frequencyDays, setFrequencyDays] = useState(
    initialData?.frequencyDays?.toString() ?? ""
  );
  const [isIrregular, setIsIrregular] = useState(
    initialData?.isIrregular ?? false
  );
  const [minimumExpected, setMinimumExpected] = useState(
    initialData?.minimumExpected?.toString() ?? ""
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

    let parsedFrequencyDays: number | null = null;
    if (frequency === "custom") {
      const fd = parseInt(frequencyDays, 10);
      if (isNaN(fd) || fd <= 0) {
        setError("Frequency days must be a positive number");
        return;
      }
      parsedFrequencyDays = fd;
    }

    let parsedMinimumExpected: number | null = null;
    if (minimumExpected.trim() !== "") {
      parsedMinimumExpected = parseFloat(minimumExpected);
      if (isNaN(parsedMinimumExpected) || parsedMinimumExpected < 0) {
        setError("Minimum expected must be a non-negative number");
        return;
      }
    }

    const data: IncomeFormData = {
      name: trimmedName,
      expectedAmount: parsedAmount,
      frequency,
      frequencyDays: parsedFrequencyDays,
      isIrregular,
      minimumExpected: parsedMinimumExpected,
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

      <div className={styles.fieldRow}>
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
          <label className={styles.label} htmlFor="income-frequency">
            Frequency
          </label>
          <select
            id="income-frequency"
            className={styles.input}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {frequency === "custom" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="income-frequency-days">
            Every how many days?
          </label>
          <input
            id="income-frequency-days"
            className={styles.input}
            type="number"
            min="1"
            step="1"
            value={frequencyDays}
            onChange={(e) => setFrequencyDays(e.target.value)}
            placeholder="e.g. 14"
          />
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isIrregular}
            onChange={(e) => setIsIrregular(e.target.checked)}
          />
          <span>Irregular income (variable timing or amount)</span>
        </label>
      </div>

      {isIrregular && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="income-minimum">
            Minimum Expected
          </label>
          <input
            id="income-minimum"
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            value={minimumExpected}
            onChange={(e) => setMinimumExpected(e.target.value)}
            placeholder="Conservative estimate"
          />
        </div>
      )}

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
