"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../onboarding.module.css";
import incomeStyles from "./income.module.css";

interface IncomeEntry {
  name: string;
  amount: string;
  frequency: string;
}

export default function OnboardingManualIncomePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
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

    setEntries([...entries, { name: name.trim(), amount, frequency }]);
    setName("");
    setAmount("");
    setFrequency("monthly");
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
                    ${entry.amount} / {entry.frequency}
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
              <label className={incomeStyles.label} htmlFor="income-frequency">
                Frequency
              </label>
              <select
                id="income-frequency"
                className={incomeStyles.input}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="twice_monthly">Twice monthly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
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
