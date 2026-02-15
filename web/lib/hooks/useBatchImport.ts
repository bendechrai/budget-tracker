"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { logError } from "@/lib/logging";

export interface BatchFileStatus {
  id: string;
  position: number;
  fileName: string;
  format: string;
  status: "pending" | "processing" | "completed" | "failed";
  transactionsFound: number;
  transactionsImported: number;
  duplicatesSkipped: number;
  duplicatesFlagged: number;
  flaggedData: unknown;
  importLogId: string | null;
  errorMessage: string | null;
}

export interface BatchStatus {
  batchId: string;
  status: "pending" | "processing" | "completed" | "failed";
  fileCount: number;
  filesCompleted: number;
  totalTransactionsFound: number;
  totalTransactionsImported: number;
  totalDuplicatesSkipped: number;
  totalDuplicatesFlagged: number;
  patternDetectionComplete: boolean;
  errorMessage: string | null;
  files: BatchFileStatus[];
}

export interface UseBatchImportReturn {
  uploadFiles: (files: File[]) => Promise<void>;
  batch: BatchStatus | null;
  isUploading: boolean;
  isProcessing: boolean;
  isComplete: boolean;
  error: string | null;
  reset: () => void;
}

const POLL_INTERVAL_MS = 2000;

export function useBatchImport(): UseBatchImportReturn {
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const poll = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/import/batch/${batchId}`);
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "failed to fetch batch status");
        stopPolling();
        return;
      }

      const data = (await res.json()) as BatchStatus;
      setBatch(data);

      if (data.status === "completed" || data.status === "failed") {
        stopPolling();
        if (data.status === "failed" && data.errorMessage) {
          setError(data.errorMessage);
        }
      }
    } catch (err) {
      logError("failed to poll batch status", err);
      setError("Failed to check import progress");
      stopPolling();
    }
  }, [stopPolling]);

  const startPolling = useCallback((batchId: string) => {
    batchIdRef.current = batchId;
    // Do an immediate poll
    void poll(batchId);
    pollingRef.current = setInterval(() => {
      void poll(batchId);
    }, POLL_INTERVAL_MS);
  }, [poll]);

  const uploadFiles = useCallback(async (files: File[]) => {
    setError(null);
    setBatch(null);
    setIsUploading(true);
    stopPolling();

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/import/batch", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Upload failed");
        setIsUploading(false);
        return;
      }

      const data = (await res.json()) as BatchStatus;
      setBatch(data);
      setIsUploading(false);

      // Start polling for processing progress
      startPolling(data.batchId);
    } catch (err) {
      logError("failed to upload batch", err);
      setError("Upload failed. Please try again.");
      setIsUploading(false);
    }
  }, [stopPolling, startPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setBatch(null);
    setIsUploading(false);
    setError(null);
    batchIdRef.current = null;
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const isProcessing = batch !== null &&
    (batch.status === "pending" || batch.status === "processing");
  const isComplete = batch !== null && batch.status === "completed";

  return {
    uploadFiles,
    batch,
    isUploading,
    isProcessing,
    isComplete,
    error,
    reset,
  };
}
