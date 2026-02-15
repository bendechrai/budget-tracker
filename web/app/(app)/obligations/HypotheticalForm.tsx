"use client";

import { useState } from "react";
import type { HypotheticalObligation } from "@/app/contexts/WhatIfContext";
import type { ObligationType, IncomeFrequency } from "@/app/generated/prisma/client";
import styles from "./obligations.module.css";

interface HypotheticalFormProps {
  onAdd: (obligation: HypotheticalObligation) => void;
  onCancel: () => void;
}

export default function HypotheticalForm({ onAdd, onCancel }: HypotheticalFormProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<ObligationType>("one_off");
  const [frequency, setFrequency] = useState<IncomeFrequency | "">("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [formError, setFormError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError("Amount must be a positive number");
      return;
    }

    if (!nextDueDate) {
      setFormError("Due date is required");
      return;
    }

    if (type !== "one_off" && !frequency) {
      setFormError("Frequency is required for recurring obligations");
      return;
    }

    const hypo: HypotheticalObligation = {
      id: `hypothetical-${Date.now()}`,
      name: name.trim(),
      type,
      amount: parsedAmount,
      frequency: frequency || null,
      frequencyDays: null,
      nextDueDate: new Date(nextDueDate),
      endDate: null,
      fundGroupId: null,
    };

    onAdd(hypo);
  }

  return (
    <form onSubmit={handleSubmit} className={styles.hypotheticalForm} data-testid="hypothetical-form">
      <h3 className={styles.hypotheticalFormTitle}>Add hypothetical obligation</h3>

      {formError && (
        <div className={styles.error} role="alert">{formError}</div>
      )}

      <div className={styles.hypotheticalFormField}>
        <label htmlFor="hypo-name">Name</label>
        <input
          id="hypo-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Holiday in December"
        />
      </div>

      <div className={styles.hypotheticalFormField}>
        <label htmlFor="hypo-amount">Amount ($)</label>
        <input
          id="hypo-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
        />
      </div>

      <div className={styles.hypotheticalFormField}>
        <label htmlFor="hypo-type">Type</label>
        <select
          id="hypo-type"
          value={type}
          onChange={(e) => setType(e.target.value as ObligationType)}
        >
          <option value="one_off">One-off</option>
          <option value="recurring">Recurring</option>
        </select>
      </div>

      {type !== "one_off" && (
        <div className={styles.hypotheticalFormField}>
          <label htmlFor="hypo-frequency">Frequency</label>
          <select
            id="hypo-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}
          >
            <option value="">Select...</option>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="twice_monthly">Twice monthly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
      )}

      <div className={styles.hypotheticalFormField}>
        <label htmlFor="hypo-date">Due date</label>
        <input
          id="hypo-date"
          type="date"
          value={nextDueDate}
          onChange={(e) => setNextDueDate(e.target.value)}
        />
      </div>

      <div className={styles.hypotheticalFormActions}>
        <button type="submit" className={styles.addButton}>
          Add
        </button>
        <button type="button" className={styles.pauseButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
