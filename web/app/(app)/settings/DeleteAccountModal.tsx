"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logError } from "@/lib/logging";
import styles from "./delete-account-modal.module.css";

interface DeleteAccountModalProps {
  onClose: () => void;
}

type ModalStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string };

export default function DeleteAccountModal({ onClose }: DeleteAccountModalProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<ModalStatus>({ type: "idle" });

  const isLoading = status.type === "loading";
  const canDelete = confirmation === "DELETE" && !isLoading;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isLoading]);

  const handleDelete = useCallback(async () => {
    if (confirmation !== "DELETE") return;

    setStatus({ type: "loading" });

    try {
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error || "Failed to delete account");
      }

      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      logError("failed to delete account", err);
      setStatus({ type: "error", message });
    }
  }, [confirmation, router]);

  return (
    <div className={styles.overlay} data-testid="delete-account-modal-overlay">
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Delete account"
        onClick={(e) => e.stopPropagation()}
        data-testid="delete-account-modal"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Delete Account</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            data-testid="delete-account-modal-close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.warning}>
            This will permanently delete your account and all associated data. This action cannot be undone.
          </p>

          <div className={styles.inputSection}>
            <label className={styles.inputLabel} htmlFor="delete-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              type="text"
              className={styles.confirmInput}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canDelete) {
                  void handleDelete();
                }
              }}
              placeholder="DELETE"
              disabled={isLoading}
              data-testid="delete-account-modal-input"
            />
          </div>

          {status.type === "error" && (
            <p className={styles.statusError} data-testid="delete-account-modal-error">
              {status.message}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isLoading}
            data-testid="delete-account-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => void handleDelete()}
            disabled={!canDelete}
            data-testid="delete-account-modal-confirm"
          >
            {isLoading ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
