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
  frequency: string | null;
  frequencyDays: number | null;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  fundGroupId: string | null;
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

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
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
  const [frequency, setFrequency] = useState(
    initialData?.frequency ?? "monthly"
  );
  const [frequencyDays, setFrequencyDays] = useState(
    initialData?.frequencyDays?.toString() ?? ""
  );
  const [startDate, setStartDate] = useState(
    formatDateForInput(initialData?.startDate)
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

    // Validate frequency for recurring types
    let finalFrequency: string | null = null;
    let finalFrequencyDays: number | null = null;
    if (showFrequency) {
      finalFrequency = frequency;
      if (frequency === "custom") {
        const fd = parseInt(frequencyDays, 10);
        if (isNaN(fd) || fd <= 0) {
          setError("Frequency days must be a positive number");
          return;
        }
        finalFrequencyDays = fd;
      }
    }

    // Validate startDate
    if (!startDate) {
      setError("Start date is required");
      return;
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
      frequency: finalFrequency,
      frequencyDays: finalFrequencyDays,
      startDate,
      endDate: finalEndDate,
      nextDueDate,
      fundGroupId: fundGroupId || null,
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

      <div className={styles.fieldRow}>
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
            <label className={styles.label} htmlFor="obligation-frequency">
              Frequency
            </label>
            <select
              id="obligation-frequency"
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
        )}
      </div>

      {showFrequency && frequency === "custom" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="obligation-frequency-days">
            Every how many days?
          </label>
          <input
            id="obligation-frequency-days"
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

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="obligation-start-date">
            Start Date
          </label>
          <input
            id="obligation-start-date"
            className={styles.input}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

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
            Fund Group
          </label>
          <select
            id="obligation-fund-group"
            className={styles.input}
            value={fundGroupId}
            onChange={(e) => setFundGroupId(e.target.value)}
          >
            <option value="">None (default group)</option>
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
