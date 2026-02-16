"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

interface UseConfirmDialogReturn {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title ?? ""}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, confirmDialog };
}
