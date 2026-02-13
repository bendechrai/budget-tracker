"use client";

import { useState } from "react";
import { useWhatIf } from "@/app/contexts/WhatIfContext";
import { logError } from "@/lib/logging";
import styles from "./scenario-banner.module.css";

export default function ScenarioBanner() {
  const { isActive, changeSummary, overrides, resetAll } = useWhatIf();
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!isActive) return null;

  async function applyChanges() {
    setApplying(true);
    try {
      const promises: Promise<Response>[] = [];

      // Pause toggled-off obligations
      for (const id of overrides.toggledOffIds) {
        promises.push(
          fetch(`/api/obligations/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPaused: true }),
          })
        );
      }

      // Update overridden amounts
      for (const [id, amount] of overrides.amountOverrides) {
        promises.push(
          fetch(`/api/obligations/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          })
        );
      }

      // Save hypothetical obligations as real ones
      for (const hypo of overrides.hypotheticals) {
        promises.push(
          fetch("/api/obligations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: hypo.name,
              type: hypo.type,
              amount: hypo.amount,
              frequency: hypo.frequency,
              frequencyDays: hypo.frequencyDays,
              nextDueDate: hypo.nextDueDate.toISOString(),
              endDate: hypo.endDate ? hypo.endDate.toISOString() : null,
              fundGroupId: hypo.fundGroupId,
            }),
          })
        );
      }

      // Save hypothetical escalation rules as real ones
      for (const [, rules] of overrides.escalationOverrides) {
        for (const esc of rules) {
          promises.push(
            fetch("/api/escalations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                obligationId: esc.obligationId,
                changeType: esc.changeType,
                value: esc.value,
                effectiveDate: esc.effectiveDate.toISOString(),
                intervalMonths: esc.intervalMonths,
              }),
            })
          );
        }
      }

      await Promise.all(promises);
      resetAll();
      setShowConfirm(false);
      window.location.reload();
    } catch (err) {
      logError("failed to apply what-if changes", err);
    } finally {
      setApplying(false);
    }
  }

  const confirmationLines: string[] = [];
  const toggledCount = overrides.toggledOffIds.size;
  const amountCount = overrides.amountOverrides.size;
  const hypotheticalCount = overrides.hypotheticals.length;
  const escalationCount = overrides.escalationOverrides.size;

  if (toggledCount > 0) {
    confirmationLines.push(
      `Pause ${toggledCount} obligation${toggledCount === 1 ? "" : "s"}`
    );
  }
  if (amountCount > 0) {
    confirmationLines.push(
      `Update ${amountCount} obligation amount${amountCount === 1 ? "" : "s"}`
    );
  }
  if (hypotheticalCount > 0) {
    confirmationLines.push(
      `Create ${hypotheticalCount} new obligation${hypotheticalCount === 1 ? "" : "s"}`
    );
  }
  if (escalationCount > 0) {
    let totalRules = 0;
    for (const [, rules] of overrides.escalationOverrides) {
      totalRules += rules.length;
    }
    confirmationLines.push(
      `Add ${totalRules} price change rule${totalRules === 1 ? "" : "s"}`
    );
  }

  return (
    <div className={styles.banner} role="status" data-testid="scenario-banner">
      <div className={styles.content}>
        <span className={styles.label}>What-if scenario active</span>
        <span className={styles.summary}>{changeSummary}</span>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.resetButton}
          onClick={resetAll}
        >
          Reset
        </button>
        <button
          type="button"
          className={styles.applyButton}
          onClick={() => setShowConfirm(true)}
        >
          Apply
        </button>
      </div>

      {showConfirm && (
        <div
          className={styles.confirmOverlay}
          data-testid="confirm-dialog"
          role="dialog"
          aria-label="Confirm applying what-if changes"
        >
          <div className={styles.confirmDialog}>
            <h3 className={styles.confirmTitle}>Apply what-if changes?</h3>
            <p className={styles.confirmDescription}>
              This will make the following changes permanent:
            </p>
            <ul className={styles.confirmList}>
              {confirmationLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmApplyButton}
                onClick={() => void applyChanges()}
                disabled={applying}
              >
                {applying ? "Applying..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
