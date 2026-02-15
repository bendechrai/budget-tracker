"use client";

import { useState, useCallback, useMemo } from "react";
import styles from "./catchup-modal.module.css";
import { logError } from "@/lib/logging";

export interface CatchUpObligation {
  id: string;
  name: string;
  amountNeeded: number;
  currentBalance: number;
  nextDueDate: string;
}

interface CatchUpModalProps {
  obligations: CatchUpObligation[];
  onClose: () => void;
  onSaved: () => void;
}

type ModalStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success" }
  | { type: "error"; message: string };

interface AllocationEntry {
  obligationId: string;
  amount: string;
}

/**
 * Distributes a lump sum across obligations prioritized by nearest due date.
 * Each obligation gets up to its remaining shortfall before the next one receives funds.
 */
function distributeByPriority(
  total: number,
  obligations: CatchUpObligation[]
): AllocationEntry[] {
  // Sort by nearest due date
  const sorted = [...obligations].sort(
    (a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
  );

  let remaining = total;
  const allocations: AllocationEntry[] = [];

  for (const obl of sorted) {
    const shortfall = Math.max(0, obl.amountNeeded - obl.currentBalance);
    if (shortfall <= 0) {
      allocations.push({ obligationId: obl.id, amount: "0" });
      continue;
    }

    const allocated = Math.min(remaining, shortfall);
    allocations.push({
      obligationId: obl.id,
      amount: allocated > 0 ? allocated.toFixed(2) : "0",
    });
    remaining = Math.max(0, remaining - allocated);
  }

  return allocations;
}

export default function CatchUpModal({
  obligations,
  onClose,
  onSaved,
}: CatchUpModalProps) {
  const totalShortfall = useMemo(() => {
    return obligations.reduce((sum, o) => {
      return sum + Math.max(0, o.amountNeeded - o.currentBalance);
    }, 0);
  }, [obligations]);

  const allFunded = totalShortfall <= 0;

  const [lumpSum, setLumpSum] = useState("");
  const [allocations, setAllocations] = useState<AllocationEntry[]>([]);
  const [validationError, setValidationError] = useState("");
  const [status, setStatus] = useState<ModalStatus>({ type: "idle" });
  const [showPreview, setShowPreview] = useState(false);

  const handleDistribute = useCallback(() => {
    const parsed = parseFloat(lumpSum);
    if (isNaN(parsed) || parsed <= 0) {
      setValidationError("Amount must be greater than zero");
      return;
    }

    setValidationError("");
    const distributed = distributeByPriority(parsed, obligations);
    setAllocations(distributed);
    setShowPreview(true);
  }, [lumpSum, obligations]);

  const handleAllocationChange = useCallback(
    (obligationId: string, value: string) => {
      setAllocations((prev) =>
        prev.map((a) =>
          a.obligationId === obligationId ? { ...a, amount: value } : a
        )
      );
    },
    []
  );

  const allocationSum = useMemo(() => {
    return allocations.reduce((sum, a) => {
      const val = parseFloat(a.amount);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [allocations]);

  const parsedLumpSum = parseFloat(lumpSum) || 0;
  const sumMatches = Math.abs(allocationSum - parsedLumpSum) < 0.01;

  const handleConfirm = useCallback(async () => {
    if (!sumMatches) {
      setValidationError("Allocations must sum to the lump sum amount");
      return;
    }

    // Filter to non-zero allocations
    const contributions = allocations
      .map((a) => ({
        obligationId: a.obligationId,
        amount: parseFloat(a.amount),
      }))
      .filter((c) => !isNaN(c.amount) && c.amount > 0);

    if (contributions.length === 0) {
      setValidationError("At least one allocation must be greater than zero");
      return;
    }

    setValidationError("");
    setStatus({ type: "loading" });

    try {
      const res = await fetch("/api/contributions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributions }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to record contributions");
      }

      setStatus({ type: "success" });
      window.dispatchEvent(new CustomEvent("budget-data-changed"));
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to record contributions";
      logError("failed to record bulk contributions", err);
      setStatus({ type: "error", message });
    }
  }, [allocations, sumMatches, onSaved]);

  const isLoading = status.type === "loading";

  // Map obligations by ID for display in preview
  const obligationMap = useMemo(() => {
    const map = new Map<string, CatchUpObligation>();
    for (const o of obligations) {
      map.set(o.id, o);
    }
    return map;
  }, [obligations]);

  return (
    <div className={styles.overlay} data-testid="catchup-modal-overlay">
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Lump sum catch-up"
        data-testid="catchup-modal"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Lump Sum Catch-Up</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            data-testid="catchup-modal-close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {allFunded && (
            <p className={styles.allFunded} data-testid="catchup-all-funded">
              All obligations are already fully funded — no catch-up needed
            </p>
          )}

          {!allFunded && !showPreview && (
            <div className={styles.amountInputSection}>
              <label className={styles.amountLabel} htmlFor="catchup-amount">
                Lump sum amount
              </label>
              <input
                id="catchup-amount"
                type="number"
                className={styles.amountInput}
                value={lumpSum}
                onChange={(e) => {
                  setLumpSum(e.target.value);
                  setValidationError("");
                }}
                step="0.01"
                min="0.01"
                disabled={isLoading}
                data-testid="catchup-amount-input"
              />
              <p className={styles.totalShortfall} data-testid="catchup-total-shortfall">
                Total shortfall: ${totalShortfall.toFixed(2)}
              </p>
              {validationError && (
                <p className={styles.validationError} data-testid="catchup-validation-error">
                  {validationError}
                </p>
              )}
            </div>
          )}

          {!allFunded && showPreview && (
            <div className={styles.distributionSection} data-testid="catchup-distribution">
              <p className={styles.distributionTitle}>Distribution Preview</p>
              <div className={styles.distributionList}>
                {allocations.map((alloc) => {
                  const obl = obligationMap.get(alloc.obligationId);
                  if (!obl) return null;
                  const shortfall = Math.max(0, obl.amountNeeded - obl.currentBalance);
                  return (
                    <div
                      key={alloc.obligationId}
                      className={styles.distributionRow}
                      data-testid={`catchup-row-${alloc.obligationId}`}
                    >
                      <span className={styles.distributionName}>{obl.name}</span>
                      <span className={styles.distributionShortfall}>
                        needs ${shortfall.toFixed(2)}
                      </span>
                      <input
                        type="number"
                        className={styles.distributionAmountInput}
                        value={alloc.amount}
                        onChange={(e) =>
                          handleAllocationChange(alloc.obligationId, e.target.value)
                        }
                        step="0.01"
                        min="0"
                        disabled={isLoading}
                        data-testid={`catchup-alloc-${alloc.obligationId}`}
                        aria-label={`Allocation for ${obl.name}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className={styles.sumRow}>
                <span className={styles.sumLabel}>Total allocated</span>
                <span
                  className={`${styles.sumValue} ${!sumMatches ? styles.sumMismatch : ""}`}
                  data-testid="catchup-allocation-sum"
                >
                  ${allocationSum.toFixed(2)}
                </span>
              </div>
              {validationError && (
                <p className={styles.validationError} data-testid="catchup-validation-error">
                  {validationError}
                </p>
              )}
            </div>
          )}

          {status.type === "success" && (
            <p className={styles.statusSuccess} data-testid="catchup-success">
              Contributions recorded
            </p>
          )}
          {status.type === "error" && (
            <p className={styles.statusError} data-testid="catchup-error">
              {status.message}
            </p>
          )}
        </div>

        {status.type !== "success" && !allFunded && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={showPreview ? () => setShowPreview(false) : onClose}
              disabled={isLoading}
              data-testid="catchup-cancel"
            >
              {showPreview ? "Back" : "Cancel"}
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={showPreview ? () => void handleConfirm() : handleDistribute}
              disabled={isLoading || (showPreview && !sumMatches)}
              data-testid="catchup-confirm"
            >
              {isLoading
                ? "Saving..."
                : showPreview
                  ? "Confirm"
                  : "Preview distribution"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
