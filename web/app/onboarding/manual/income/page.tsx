"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../onboarding.module.css";
import incomeStyles from "./income.module.css";

interface IncomeEntry {
  name: string;
  amount: string;
  intervalUnit: string;
  intervalCount: number;
}

const INTERVAL_UNIT_OPTIONS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "twice_monthly", label: "twice monthly" },
  { value: "month", label: "months" },
  { value: "quarter", label: "quarters" },
  { value: "year", label: "years" },
];

function formatInterval(unit: string | null, count: number): string {
  if (!unit) return "—";
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

export default function OnboardingManualIncomePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [intervalUnit, setIntervalUnit] = useState("month");
  const [intervalCount, setIntervalCount] = useState("1");
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
      },
    ]);
    setName("");
    setAmount("");
    setIntervalUnit("month");
    setIntervalCount("1");
  }

  function handleRemove(index: number) {
    setEntries(entries.filter((_, i) => i !== index));
  }

  function handleContinue() {
    router.push("/onboarding/manual/obligations");
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Income Sources</h1>
        <p className={styles.subtitle}>
          Add your regular income sources — salary, freelance work, side
          projects, or anything else. You can always update these later.
        </p>

        {entries.length > 0 && (
          <ul className={incomeStyles.list}>
            {entries.map((entry, i) => (
              <li key={i} className={incomeStyles.listItem}>
                <div className={incomeStyles.listItemInfo}>
                  <span className={incomeStyles.listItemName}>{entry.name}</span>
                  <span className={incomeStyles.listItemDetail}>
                    ${entry.amount} / {formatInterval(entry.intervalUnit, entry.intervalCount)}
                  </span>
                </div>
                <button
                  type="button"
                  className={incomeStyles.removeButton}
                  onClick={() => handleRemove(i)}
                  aria-label={`Remove ${entry.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className={incomeStyles.form} onSubmit={handleAdd}>
          {error && (
            <div className={incomeStyles.error} role="alert">
              {error}
            </div>
          )}

          <div className={incomeStyles.field}>
            <label className={incomeStyles.label} htmlFor="income-name">
              Name
            </label>
            <input
              id="income-name"
              className={incomeStyles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Salary, Freelance"
            />
          </div>

          <div className={incomeStyles.fieldRow}>
            <div className={incomeStyles.field}>
              <label className={incomeStyles.label} htmlFor="income-amount">
                Amount
              </label>
              <input
                id="income-amount"
                className={incomeStyles.input}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className={incomeStyles.field}>
              <label className={incomeStyles.label} htmlFor="income-interval-count">
                Every
              </label>
              <input
                id="income-interval-count"
                className={incomeStyles.input}
                type="number"
                min="1"
                step="1"
                value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
              />
            </div>
            <div className={incomeStyles.field}>
              <label className={incomeStyles.label} htmlFor="income-interval-unit">
                Unit
              </label>
              <select
                id="income-interval-unit"
                className={incomeStyles.input}
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

          <button type="submit" className={incomeStyles.addButton}>
            Add income source
          </button>
        </form>

        <div className={incomeStyles.actions}>
          <button
            type="button"
            className={incomeStyles.continueButton}
            onClick={handleContinue}
          >
            {entries.length > 0 ? "Continue" : "Continue without income"}
          </button>

          <Link href="/onboarding/manual/obligations" className={styles.skipLink}>
            Skip to obligations
          </Link>
        </div>
      </div>
    </div>
  );
}
