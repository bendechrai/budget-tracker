import { useEffect, useCallback } from "react";
import styles from "./confirm-dialog.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onCancel}
      data-testid="confirm-dialog-overlay"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-dialog"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
        </div>

        <div className={styles.content}>
          <p className={styles.message} data-testid="confirm-dialog-message">
            {message}
          </p>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              variant === "danger"
                ? styles.confirmButtonDanger
                : styles.confirmButton
            }
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
