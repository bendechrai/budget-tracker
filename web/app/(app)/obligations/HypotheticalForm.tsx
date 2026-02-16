"use client";

import { useState } from "react";
import type { HypotheticalObligation } from "@/app/contexts/WhatIfContext";
import type { ObligationType, IntervalUnit } from "@/app/generated/prisma/client";
import styles from "./obligations.module.css";

interface HypotheticalFormProps {
  onAdd: (obligation: HypotheticalObligation) => void;
  onCancel: () => void;
}

const INTERVAL_PRESETS: Array<{
  label: string;
  unit: string;
  count: number;
}> = [
  { label: "Weekly", unit: "week", count: 1 },
  { label: "Fortnightly", unit: "week", count: 2 },
  { label: "Monthly", unit: "month", count: 1 },
  { label: "Quarterly", unit: "quarter", count: 1 },
  { label: "Annual", unit: "year", count: 1 },
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

  function applyPreset(unit: string, count: number) {
    setIntervalUnit(unit as IntervalUnit);
    setIntervalCount(count.toString());
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
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
            {INTERVAL_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                style={{
                  padding: "4px 10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  cursor: "pointer",
                  background:
                    intervalUnit === preset.unit &&
                    parseInt(intervalCount, 10) === preset.count
                      ? "var(--foreground)"
                      : "transparent",
                  color:
                    intervalUnit === preset.unit &&
                    parseInt(intervalCount, 10) === preset.count
                      ? "var(--background)"
                      : "inherit",
                  fontSize: "13px",
                }}
                onClick={() => applyPreset(preset.unit, preset.count)}
              >
                {preset.label}
              </button>
            ))}
          </div>
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
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
                <option value="quarter">quarters</option>
                <option value="year">years</option>
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
