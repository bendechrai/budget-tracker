"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../onboarding.module.css";
import obligationStyles from "./obligations.module.css";

interface ObligationEntry {
  name: string;
  amount: string;
  intervalUnit: string;
  intervalCount: number;
  dueDate: string;
}

const INTERVAL_UNIT_OPTIONS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "quarter", label: "quarters" },
  { value: "year", label: "years" },
];

function formatInterval(unit: string, count: number): string {
  if (unit === "twice_monthly") return "Twice monthly";
  const labels: Record<string, [string, string]> = {
    day: ["Daily", "days"],
    week: ["Weekly", "weeks"],
    month: ["Monthly", "months"],
    quarter: ["Quarterly", "quarters"],
    year: ["Annually", "years"],
  };
  const [singular, plural] = labels[unit] ?? [unit, unit + "s"];
  if (count === 1) return singular;
  return `Every ${count} ${plural}`;
}

export default function OnboardingManualObligationsPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<ObligationEntry[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [intervalUnit, setIntervalUnit] = useState("month");
  const [intervalCount, setIntervalCount] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Amount must be a positive number");
      return;
    }

    const parsedCount = parseInt(intervalCount, 10);
    if (isNaN(parsedCount) || parsedCount <= 0) {
      setError("Interval count must be a positive number");
      return;
    }

    setEntries([
      ...entries,
      {
        name: name.trim(),
        amount,
        intervalUnit,
        intervalCount: parsedCount,
        dueDate,
      },
    ]);
    setName("");
    setAmount("");
    setIntervalUnit("month");
    setIntervalCount("1");
    setDueDate("");
  }

  function handleRemove(index: number) {
    setEntries(entries.filter((_, i) => i !== index));
  }

  function handleContinue() {
    router.push("/onboarding/fund-setup");
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Obligations</h1>
        <p className={styles.subtitle}>
          Add your regular expenses and obligations — rent, subscriptions,
          insurance, or anything you need to save for. You can always update
          these later.
        </p>

        {entries.length > 0 && (
          <ul className={obligationStyles.list}>
            {entries.map((entry, i) => (
              <li key={i} className={obligationStyles.listItem}>
                <div className={obligationStyles.listItemInfo}>
                  <span className={obligationStyles.listItemName}>
                    {entry.name}
                  </span>
                  <span className={obligationStyles.listItemDetail}>
                    ${entry.amount} / {formatInterval(entry.intervalUnit, entry.intervalCount)}
                    {entry.dueDate && ` — due ${entry.dueDate}`}
                  </span>
                </div>
                <button
                  type="button"
                  className={obligationStyles.removeButton}
                  onClick={() => handleRemove(i)}
                  aria-label={`Remove ${entry.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className={obligationStyles.form} onSubmit={handleAdd}>
          {error && (
            <div className={obligationStyles.error} role="alert">
              {error}
            </div>
          )}

          <div className={obligationStyles.field}>
            <label className={obligationStyles.label} htmlFor="obligation-name">
              Name
            </label>
            <input
              id="obligation-name"
              className={obligationStyles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rent, Netflix, Insurance"
            />
          </div>

          <div className={obligationStyles.fieldRow}>
            <div className={obligationStyles.field}>
              <label
                className={obligationStyles.label}
                htmlFor="obligation-amount"
              >
                Amount
              </label>
              <input
                id="obligation-amount"
                className={obligationStyles.input}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className={obligationStyles.field}>
              <label
                className={obligationStyles.label}
                htmlFor="obligation-interval-count"
              >
                Every
              </label>
              <input
                id="obligation-interval-count"
                className={obligationStyles.input}
                type="number"
                min="1"
                step="1"
                value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
              />
            </div>
            <div className={obligationStyles.field}>
              <label
                className={obligationStyles.label}
                htmlFor="obligation-interval-unit"
              >
                Unit
              </label>
              <select
                id="obligation-interval-unit"
                className={obligationStyles.input}
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

          <div className={obligationStyles.field}>
            <label
              className={obligationStyles.label}
              htmlFor="obligation-due-date"
            >
              Next due date (optional)
            </label>
            <input
              id="obligation-due-date"
              className={obligationStyles.input}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <button type="submit" className={obligationStyles.addButton}>
            Add obligation
          </button>
        </form>

        <div className={obligationStyles.actions}>
          <button
            type="button"
            className={obligationStyles.continueButton}
            onClick={handleContinue}
          >
            {entries.length > 0 ? "Continue" : "Continue without obligations"}
          </button>

          <Link href="/onboarding/fund-setup" className={styles.skipLink}>
            Skip to fund setup
          </Link>
        </div>
      </div>
    </div>
  );
}
