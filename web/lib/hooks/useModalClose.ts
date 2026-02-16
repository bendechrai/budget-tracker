"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useConfirmDialog } from "./useConfirmDialog";

interface UseModalCloseReturn {
  handleClose: () => void;
  confirmDialog: ReactNode;
}

/**
 * Hook that provides Escape-key-to-close, Enter-key-to-submit, and dirty-state confirmation for modals.
 *
 * @param onClose - callback to close the modal
 * @param isDirty - whether the modal has unsaved changes
 * @param enabled - set to false while saving to prevent closing mid-save
 * @param onSubmit - optional callback triggered by Enter key (skipped for textarea targets)
 * @returns { handleClose, confirmDialog } - use handleClose for x, Cancel, overlay click, and Escape;
 *   render confirmDialog in JSX
 */
export function useModalClose(
  onClose: () => void,
  isDirty: boolean,
  enabled = true,
  onSubmit?: () => void,
): UseModalCloseReturn {
  const { confirm, confirmDialog } = useConfirmDialog();
  const isConfirmingRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const handleClose = useCallback(() => {
    if (!enabled) return;
    if (isConfirmingRef.current) return;

    if (isDirty) {
      isConfirmingRef.current = true;
      void confirm({
        title: "Unsaved changes",
        message: "You have unsaved changes. Close anyway?",
        confirmLabel: "Close",
      }).then((ok) => {
        isConfirmingRef.current = false;
        if (ok) onClose();
      });
      return;
    }

    onClose();
  }, [onClose, isDirty, enabled, confirm]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
      if (e.key === "Enter" && onSubmitRef.current && enabled && !isConfirmingRef.current) {
        if (e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        onSubmitRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, enabled]);

  return { handleClose, confirmDialog };
}
