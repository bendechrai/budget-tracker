"use client";

import { useState } from "react";
import type { HypotheticalObligation } from "@/app/contexts/WhatIfContext";
import type { ObligationType, IntervalUnit } from "@/app/generated/prisma/client";
import styles from "./obligations.module.css";

interface HypotheticalFormProps {
  onAdd: (obligation: HypotheticalObligation) => void;
  onCancel: () => void;
}

const INTERVAL_UNIT_OPTIONS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "quarter", label: "quarters" },
  { value: "year", label: "years" },
];

export default function HypotheticalForm({ onAdd, onCancel }: HypotheticalFormProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<ObligationType>("one_off");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit | "">("");
  const [intervalCount, setIntervalCount] = useState("1");
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

    if (type !== "one_off" && !intervalUnit) {
      setFormError("Frequency is required for recurring obligations");
      return;
    }

    const parsedCount = parseInt(intervalCount, 10);
    if (type !== "one_off" && (isNaN(parsedCount) || parsedCount <= 0)) {
      setFormError("Interval count must be a positive number");
      return;
    }

    const hypo: HypotheticalObligation = {
      id: `hypothetical-${Date.now()}`,
      name: name.trim(),
      type,
      amount: parsedAmount,
      intervalUnit: intervalUnit || null,
      intervalCount: type !== "one_off" && intervalUnit ? parsedCount : 1,
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
          <label>Frequency</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="hypo-interval-count">Every</label>
              <input
                id="hypo-interval-count"
                type="number"
                min="1"
                step="1"
                value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="hypo-interval-unit">Unit</label>
              <select
                id="hypo-interval-unit"
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                style={{ width: "100%" }}
              >
                <option value="">Select...</option>
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
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
