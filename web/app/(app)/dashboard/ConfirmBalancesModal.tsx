"use client";

import { useState, useCallback } from "react";
import styles from "./confirm-balances-modal.module.css";
import { logError } from "@/lib/logging";
import { useModalClose } from "@/lib/hooks/useModalClose";

interface FundGroup {
  id: string;
  name: string;
  currentBalance: number;
}

interface ConfirmBalancesModalProps {
  fundGroups: FundGroup[];
  onClose: () => void;
  onSaved: () => void;
}

type ModalStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success" }
  | { type: "error"; message: string };

export default function ConfirmBalancesModal({
  fundGroups,
  onClose,
  onSaved,
}: ConfirmBalancesModalProps) {
  const [balances, setBalances] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const fg of fundGroups) {
      initial[fg.id] = fg.currentBalance.toFixed(2);
    }
    return initial;
  });
  const [validationError, setValidationError] = useState("");
  const [status, setStatus] = useState<ModalStatus>({ type: "idle" });

  const isDirty =
    status.type !== "success" &&
    fundGroups.some((fg) => balances[fg.id] !== fg.currentBalance.toFixed(2));

  const handleSave = useCallback(async () => {
    // Validate all balances
    for (const fg of fundGroups) {
      const parsed = parseFloat(balances[fg.id]);
      if (isNaN(parsed)) {
        setValidationError(`Invalid balance for ${fg.name}`);
        return;
      }
      if (parsed < 0) {
        setValidationError(`Balance for ${fg.name} cannot be negative`);
        return;
      }
    }

    setValidationError("");
    setStatus({ type: "loading" });

    try {
      // Only update changed balances
      const updates = fundGroups.filter(
        (fg) => balances[fg.id] !== fg.currentBalance.toFixed(2)
      );

      for (const fg of updates) {
        const parsed = parseFloat(balances[fg.id]);
        const res = await fetch(`/api/fund-groups/${fg.id}/balance`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balance: parsed }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `Failed to update balance for ${fg.name}`);
        }
      }

      setStatus({ type: "success" });
      window.dispatchEvent(new CustomEvent("budget-data-changed"));
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update balances";
      logError("failed to confirm fund balances", err);
      setStatus({ type: "error", message });
    }
  }, [balances, fundGroups, onSaved]);

  const { handleClose, confirmDialog } = useModalClose(
    onClose,
    isDirty,
    status.type !== "loading",
    () => void handleSave()
  );

  const isLoading = status.type === "loading";

  return (
    <div
      className={styles.overlay}
      data-testid="confirm-balances-modal-overlay"
    >
      {confirmDialog}
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Confirm fund balances"
        data-testid="confirm-balances-modal"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Confirm Fund Balances</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close"
            data-testid="confirm-balances-modal-close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {fundGroups.map((fg) => (
            <div
              key={fg.id}
              className={styles.fundRow}
              data-testid={`confirm-balances-row-${fg.id}`}
            >
              <span className={styles.fundName}>{fg.name}</span>
              <input
                type="number"
                className={styles.balanceInput}
                value={balances[fg.id]}
                onChange={(e) => {
                  setBalances((prev) => ({
                    ...prev,
                    [fg.id]: e.target.value,
                  }));
                  setValidationError("");
                }}
                step="0.01"
                min="0"
                disabled={isLoading}
                data-testid={`confirm-balances-input-${fg.id}`}
                aria-label={`Balance for ${fg.name}`}
              />
            </div>
          ))}

          {validationError && (
            <p
              className={styles.validationError}
              data-testid="confirm-balances-validation-error"
            >
              {validationError}
            </p>
          )}

          {status.type === "success" && (
            <p
              className={styles.statusSuccess}
              data-testid="confirm-balances-success"
            >
              Balances confirmed
            </p>
          )}
          {status.type === "error" && (
            <p
              className={styles.statusError}
              data-testid="confirm-balances-error"
            >
              {status.message}
            </p>
          )}
        </div>

        {status.type !== "success" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={isLoading}
              data-testid="confirm-balances-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => void handleSave()}
              disabled={isLoading}
              data-testid="confirm-balances-save"
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
