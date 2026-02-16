"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useConfirmDialog } from "./useConfirmDialog";

interface UseModalCloseReturn {
  handleClose: () => void;
  confirmDialog: ReactNode;
}

/**
 * Hook that provides Escape-key-to-close and dirty-state confirmation for modals.
 *
 * @param onClose - callback to close the modal
 * @param isDirty - whether the modal has unsaved changes
 * @param enabled - set to false while saving to prevent closing mid-save
 * @returns { handleClose, confirmDialog } - use handleClose for x, Cancel, overlay click, and Escape;
 *   render confirmDialog in JSX
 */
export function useModalClose(
  onClose: () => void,
  isDirty: boolean,
  enabled = true,
): UseModalCloseReturn {
  const { confirm, confirmDialog } = useConfirmDialog();
  const isConfirmingRef = useRef(false);

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
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  return { handleClose, confirmDialog };
}
