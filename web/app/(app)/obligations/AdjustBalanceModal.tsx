"use client";

import { useState, useCallback } from "react";
import styles from "./adjust-balance-modal.module.css";
import { logError } from "@/lib/logging";

interface AdjustBalanceModalProps {
  obligationId: string;
  obligationName: string;
  currentBalance: number;
  onClose: () => void;
  onSaved: () => void;
}

type ModalStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success" }
  | { type: "error"; message: string };

export default function AdjustBalanceModal({
  obligationId,
  obligationName,
  currentBalance,
  onClose,
  onSaved,
}: AdjustBalanceModalProps) {
  const [balance, setBalance] = useState(currentBalance.toFixed(2));
  const [validationError, setValidationError] = useState("");
  const [status, setStatus] = useState<ModalStatus>({ type: "idle" });

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(balance);
    if (isNaN(parsed)) {
      setValidationError("Please enter a valid number");
      return;
    }
    if (parsed < 0) {
      setValidationError("Balance cannot be negative");
      return;
    }

    setValidationError("");
    setStatus({ type: "loading" });

    try {
      const res = await fetch(`/api/fund-balances/${obligationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: parsed }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to adjust balance");
      }

      setStatus({ type: "success" });
      window.dispatchEvent(new CustomEvent("budget-data-changed"));
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to adjust balance";
      logError("failed to adjust fund balance", err);
      setStatus({ type: "error", message });
    }
  }, [balance, obligationId, onSaved]);

  const isLoading = status.type === "loading";

  return (
    <div className={styles.overlay} data-testid="adjust-balance-modal-overlay">
      <div
        className={styles.modal}
        role="dialog"
        aria-label={`Adjust balance for ${obligationName}`}
        data-testid="adjust-balance-modal"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Adjust Balance</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            data-testid="adjust-balance-modal-close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Obligation</span>
            <span className={styles.fieldValue} data-testid="adjust-balance-modal-name">
              {obligationName}
            </span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Current balance</span>
            <span className={styles.fieldValue} data-testid="adjust-balance-modal-current">
              ${currentBalance.toFixed(2)}
            </span>
          </div>

          <div className={styles.balanceInputSection}>
            <label className={styles.balanceLabel} htmlFor="adjust-balance-input">
              New balance
            </label>
            <input
              id="adjust-balance-input"
              type="number"
              className={styles.balanceInput}
              value={balance}
              onChange={(e) => {
                setBalance(e.target.value);
                setValidationError("");
              }}
              step="0.01"
              min="0"
              disabled={isLoading}
              data-testid="adjust-balance-modal-input"
            />
            {validationError && (
              <p className={styles.validationError} data-testid="adjust-balance-modal-validation-error">
                {validationError}
              </p>
            )}
          </div>

          {status.type === "success" && (
            <p className={styles.statusSuccess} data-testid="adjust-balance-modal-success">
              Balance adjusted
            </p>
          )}
          {status.type === "error" && (
            <p className={styles.statusError} data-testid="adjust-balance-modal-error">
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
              data-testid="adjust-balance-modal-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => void handleSave()}
              disabled={isLoading}
              data-testid="adjust-balance-modal-save"
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
