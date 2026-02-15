"use client";

import { useState, useCallback } from "react";
import styles from "./contribution-modal.module.css";
import { logError } from "@/lib/logging";

interface ContributionModalProps {
  obligationId: string;
  obligationName: string;
  currentBalance: number;
  amountNeeded: number;
  recommendedContribution: number;
  onClose: () => void;
  onSaved: () => void;
}

type ModalStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success" }
  | { type: "error"; message: string };

export default function ContributionModal({
  obligationId,
  obligationName,
  currentBalance,
  amountNeeded,
  recommendedContribution,
  onClose,
  onSaved,
}: ContributionModalProps) {
  const [amount, setAmount] = useState(
    recommendedContribution > 0 ? recommendedContribution.toFixed(2) : ""
  );
  const [validationError, setValidationError] = useState("");
  const [status, setStatus] = useState<ModalStatus>({ type: "idle" });

  const remaining = Math.max(0, amountNeeded - currentBalance);

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setValidationError("Amount must be greater than zero");
      return;
    }

    setValidationError("");
    setStatus({ type: "loading" });

    try {
      const res = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId,
          amount: parsed,
          type: "contribution",
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to record contribution");
      }

      setStatus({ type: "success" });
      window.dispatchEvent(new CustomEvent("budget-data-changed"));
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record contribution";
      logError("failed to record contribution", err);
      setStatus({ type: "error", message });
    }
  }, [amount, obligationId, onSaved]);

  const isLoading = status.type === "loading";

  return (
    <div className={styles.overlay} data-testid="contribution-modal-overlay">
      <div
        className={styles.modal}
        role="dialog"
        aria-label={`Record contribution for ${obligationName}`}
        data-testid="contribution-modal"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Record Contribution</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            data-testid="contribution-modal-close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Obligation</span>
            <span className={styles.fieldValue} data-testid="contribution-modal-name">
              {obligationName}
            </span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Current balance</span>
            <span className={styles.fieldValue} data-testid="contribution-modal-balance">
              ${currentBalance.toFixed(2)}
            </span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Amount needed</span>
            <span className={styles.fieldValue} data-testid="contribution-modal-needed">
              ${amountNeeded.toFixed(2)}
            </span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Remaining</span>
            <span className={styles.fieldValue} data-testid="contribution-modal-remaining">
              ${remaining.toFixed(2)}
            </span>
          </div>

          <div className={styles.amountInputSection}>
            <label className={styles.amountLabel} htmlFor="contribution-amount">
              Contribution amount
            </label>
            <input
              id="contribution-amount"
              type="number"
              className={styles.amountInput}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setValidationError("");
              }}
              step="0.01"
              min="0.01"
              disabled={isLoading}
              data-testid="contribution-modal-amount"
            />
            {validationError && (
              <p className={styles.validationError} data-testid="contribution-modal-validation-error">
                {validationError}
              </p>
            )}
          </div>

          {status.type === "success" && (
            <p className={styles.statusSuccess} data-testid="contribution-modal-success">
              Contribution recorded
            </p>
          )}
          {status.type === "error" && (
            <p className={styles.statusError} data-testid="contribution-modal-error">
              {status.message}
            </p>
          )}
        </div>

        {status.type !== "success" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isLoading}
              data-testid="contribution-modal-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => void handleSave()}
              disabled={isLoading}
              data-testid="contribution-modal-save"
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
