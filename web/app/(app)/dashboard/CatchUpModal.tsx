"use client";

import { useState, useCallback, useMemo } from "react";
import styles from "./catchup-modal.module.css";
import { logError } from "@/lib/logging";

export interface CatchUpFundGroup {
  id: string;
  name: string;
  amountNeeded: number;
  currentBalance: number;
}

interface CatchUpModalProps {
  fundGroups: CatchUpFundGroup[];
  onClose: () => void;
  onSaved: () => void;
}

type ModalStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success" }
  | { type: "error"; message: string };

interface AllocationEntry {
  fundGroupId: string;
  amount: string;
}

/**
 * Distributes a lump sum across fund groups prioritized by largest shortfall.
 * Each fund group gets up to its remaining shortfall before the next one receives funds.
 */
function distributeByPriority(
  total: number,
  fundGroups: CatchUpFundGroup[]
): AllocationEntry[] {
  // Sort by largest shortfall first
  const sorted = [...fundGroups].sort((a, b) => {
    const shortfallA = Math.max(0, a.amountNeeded - a.currentBalance);
    const shortfallB = Math.max(0, b.amountNeeded - b.currentBalance);
    return shortfallB - shortfallA;
  });

  let remaining = total;
  const allocations: AllocationEntry[] = [];

  for (const fg of sorted) {
    const shortfall = Math.max(0, fg.amountNeeded - fg.currentBalance);
    if (shortfall <= 0) {
      allocations.push({ fundGroupId: fg.id, amount: "0" });
      continue;
    }

    const allocated = Math.min(remaining, shortfall);
    allocations.push({
      fundGroupId: fg.id,
      amount: allocated > 0 ? allocated.toFixed(2) : "0",
    });
    remaining = Math.max(0, remaining - allocated);
  }

  return allocations;
}

export default function CatchUpModal({
  fundGroups,
  onClose,
  onSaved,
}: CatchUpModalProps) {
  const totalShortfall = useMemo(() => {
    return fundGroups.reduce((sum, fg) => {
      return sum + Math.max(0, fg.amountNeeded - fg.currentBalance);
    }, 0);
  }, [fundGroups]);

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
    const distributed = distributeByPriority(parsed, fundGroups);
    setAllocations(distributed);
    setShowPreview(true);
  }, [lumpSum, fundGroups]);

  const handleAllocationChange = useCallback(
    (fundGroupId: string, value: string) => {
      setAllocations((prev) =>
        prev.map((a) =>
          a.fundGroupId === fundGroupId ? { ...a, amount: value } : a
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
        fundGroupId: a.fundGroupId,
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

  // Map fund groups by ID for display in preview
  const fundGroupMap = useMemo(() => {
    const map = new Map<string, CatchUpFundGroup>();
    for (const fg of fundGroups) {
      map.set(fg.id, fg);
    }
    return map;
  }, [fundGroups]);

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
                  const fg = fundGroupMap.get(alloc.fundGroupId);
                  if (!fg) return null;
                  const shortfall = Math.max(0, fg.amountNeeded - fg.currentBalance);
                  return (
                    <div
                      key={alloc.fundGroupId}
                      className={styles.distributionRow}
                      data-testid={`catchup-row-${alloc.fundGroupId}`}
                    >
                      <span className={styles.distributionName}>{fg.name}</span>
                      <span className={styles.distributionShortfall}>
                        needs ${shortfall.toFixed(2)}
                      </span>
                      <input
                        type="number"
                        className={styles.distributionAmountInput}
                        value={alloc.amount}
                        onChange={(e) =>
                          handleAllocationChange(alloc.fundGroupId, e.target.value)
                        }
                        step="0.01"
                        min="0"
                        disabled={isLoading}
                        data-testid={`catchup-alloc-${alloc.fundGroupId}`}
                        aria-label={`Allocation for ${fg.name}`}
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
