"use client";

import { useState, FormEvent } from "react";
import styles from "./obligation-form.module.css";

interface CustomEntryInput {
  dueDate: string;
  amount: string;
}

export interface ObligationFormData {
  name: string;
  type: string;
  amount: number;
  intervalUnit: string | null;
  intervalCount: number;
  endDate: string | null;
  nextDueDate: string;
  fundGroupId: string | undefined;
  customEntries: { dueDate: string; amount: number }[];
}

interface FundGroupOption {
  id: string;
  name: string;
}

interface ObligationFormProps {
  initialData?: Partial<ObligationFormData> & {
    customEntries?: { dueDate: string; amount: number }[];
  };
  fundGroups?: FundGroupOption[];
  onSubmit: (data: ObligationFormData) => Promise<void>;
  submitLabel: string;
}

const TYPE_OPTIONS = [
  { value: "recurring", label: "Recurring" },
  { value: "recurring_with_end", label: "Recurring (with end date)" },
  { value: "one_off", label: "One-off" },
  { value: "custom", label: "Custom schedule" },
];

const INTERVAL_UNIT_OPTIONS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "quarter", label: "quarters" },
  { value: "year", label: "years" },
];

function formatDateForInput(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split("T")[0];
}

export default function ObligationForm({
  initialData,
  fundGroups,
  onSubmit,
  submitLabel,
}: ObligationFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [type, setType] = useState(initialData?.type ?? "recurring");
  const [amount, setAmount] = useState(
    initialData?.amount?.toString() ?? ""
  );
  const [intervalUnit, setIntervalUnit] = useState(
    initialData?.intervalUnit ?? "month"
  );
  const [intervalCount, setIntervalCount] = useState(
    initialData?.intervalCount?.toString() ?? "1"
  );
  const [endDate, setEndDate] = useState(
    formatDateForInput(initialData?.endDate)
  );
  const [nextDueDate, setNextDueDate] = useState(
    formatDateForInput(initialData?.nextDueDate)
  );
  const [fundGroupId, setFundGroupId] = useState(
    initialData?.fundGroupId ?? ""
  );
  const [customEntries, setCustomEntries] = useState<CustomEntryInput[]>(
    initialData?.customEntries?.map((e) => ({
      dueDate: formatDateForInput(e.dueDate),
      amount: e.amount.toString(),
    })) ?? [{ dueDate: "", amount: "" }]
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showFrequency = type === "recurring" || type === "recurring_with_end";
  const showEndDate = type === "recurring_with_end";
  const showCustomEntries = type === "custom";

  function addCustomEntry() {
    setCustomEntries((prev) => [...prev, { dueDate: "", amount: "" }]);
  }

  function removeCustomEntry(index: number) {
    setCustomEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCustomEntry(
    index: number,
    field: keyof CustomEntryInput,
    value: string
  ) {
    setCustomEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Amount must be a non-negative number");
      return;
    }

    // Validate interval for recurring types
    let finalIntervalUnit: string | null = null;
    let finalIntervalCount = 1;
    if (showFrequency) {
      if (!intervalUnit) {
        setError("Interval unit is required for recurring obligations");
        return;
      }
      finalIntervalUnit = intervalUnit;
      const ic = parseInt(intervalCount, 10);
      if (isNaN(ic) || ic <= 0) {
        setError("Interval count must be a positive number");
        return;
      }
      finalIntervalCount = ic;
    }

    // Validate nextDueDate
    if (!nextDueDate) {
      setError("Next due date is required");
      return;
    }

    // Validate endDate for recurring_with_end
    let finalEndDate: string | null = null;
    if (showEndDate) {
      if (!endDate) {
        setError("End date is required for recurring obligations with an end date");
        return;
      }
      finalEndDate = endDate;
    }

    // Validate custom entries
    const parsedCustomEntries: { dueDate: string; amount: number }[] = [];
    if (showCustomEntries) {
      if (customEntries.length === 0) {
        setError("At least one schedule entry is required for custom obligations");
        return;
      }
      for (let i = 0; i < customEntries.length; i++) {
        const entry = customEntries[i];
        if (!entry.dueDate) {
          setError(`Schedule entry ${i + 1}: date is required`);
          return;
        }
        const entryAmount = parseFloat(entry.amount);
        if (isNaN(entryAmount) || entryAmount < 0) {
          setError(`Schedule entry ${i + 1}: amount must be a non-negative number`);
          return;
        }
        parsedCustomEntries.push({
          dueDate: entry.dueDate,
          amount: entryAmount,
        });
      }
    }

    const data: ObligationFormData = {
      name: trimmedName,
      type,
      amount: parsedAmount,
      intervalUnit: finalIntervalUnit,
      intervalCount: finalIntervalCount,
      endDate: finalEndDate,
      nextDueDate,
      fundGroupId: fundGroupId || undefined,
      customEntries: parsedCustomEntries,
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
        <label className={styles.label} htmlFor="obligation-name">
          Name
        </label>
        <input
          id="obligation-name"
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Netflix, Rent, Car rego"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="obligation-type">
          Type
        </label>
        <select
          id="obligation-type"
          className={styles.input}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="obligation-amount">
          Amount
        </label>
        <input
          id="obligation-amount"
          className={styles.input}
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      {showFrequency && (
        <div className={styles.field}>
          <label className={styles.label}>Frequency</label>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="obligation-interval-count">
                Every
              </label>
              <input
                id="obligation-interval-count"
                className={styles.input}
                type="number"
                min="1"
                step="1"
                value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="obligation-interval-unit">
                Unit
              </label>
              <select
                id="obligation-interval-unit"
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
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="obligation-next-due-date">
          Next Due Date
        </label>
        <input
          id="obligation-next-due-date"
          className={styles.input}
          type="date"
          value={nextDueDate}
          onChange={(e) => setNextDueDate(e.target.value)}
        />
      </div>

      {showEndDate && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="obligation-end-date">
            End Date
          </label>
          <input
            id="obligation-end-date"
            className={styles.input}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      )}

      {showCustomEntries && (
        <div className={styles.field}>
          <label className={styles.label}>Schedule Entries</label>
          <div className={styles.customEntries}>
            {customEntries.map((entry, index) => (
              <div key={index} className={styles.customEntryRow}>
                <div className={styles.field}>
                  <label
                    className={styles.label}
                    htmlFor={`custom-entry-date-${index}`}
                  >
                    Date
                  </label>
                  <input
                    id={`custom-entry-date-${index}`}
                    className={styles.input}
                    type="date"
                    value={entry.dueDate}
                    onChange={(e) =>
                      updateCustomEntry(index, "dueDate", e.target.value)
                    }
                  />
                </div>
                <div className={styles.field}>
                  <label
                    className={styles.label}
                    htmlFor={`custom-entry-amount-${index}`}
                  >
                    Amount
                  </label>
                  <input
                    id={`custom-entry-amount-${index}`}
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={entry.amount}
                    onChange={(e) =>
                      updateCustomEntry(index, "amount", e.target.value)
                    }
                    placeholder="0.00"
                  />
                </div>
                {customEntries.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeEntryButton}
                    onClick={() => removeCustomEntry(index)}
                    aria-label={`Remove entry ${index + 1}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className={styles.addEntryButton}
              onClick={addCustomEntry}
            >
              Add entry
            </button>
          </div>
        </div>
      )}

      {fundGroups && fundGroups.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="obligation-fund-group">
            Sinking Fund
          </label>
          <select
            id="obligation-fund-group"
            className={styles.input}
            value={fundGroupId}
            onChange={(e) => setFundGroupId(e.target.value)}
          >
            {fundGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

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
