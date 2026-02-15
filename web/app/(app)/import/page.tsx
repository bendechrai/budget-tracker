"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import styles from "./import.module.css";
import { logError } from "@/lib/logging";
import { useBatchImport } from "@/lib/hooks/useBatchImport";
import type { BatchFileStatus } from "@/lib/hooks/useBatchImport";

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  referenceId: string | null;
}

interface ExistingTransaction {
  referenceId: string | null;
  fingerprint: string;
  date: string;
  amount: number;
  description: string;
}

interface FlaggedItem {
  transaction: ParsedTransaction;
  matchedExisting: ExistingTransaction;
  reason: string;
}

type FlaggedDecision = "keep" | "skip";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fileStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "\u2713";
    case "failed":
      return "\u2717";
    case "processing":
      return "\u2026";
    default:
      return "\u2022";
  }
}

const FORMAT_LABELS: Record<string, string> = {
  csv: "CSV",
  ofx: "OFX",
  pdf: "PDF",
};

export default function ImportPage() {
  const {
    uploadFiles: batchUpload,
    batch,
    isUploading,
    isProcessing,
    isComplete,
    error: batchError,
    reset: resetBatch,
  } = useBatchImport();

  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Record<number, FlaggedDecision>>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync batch errors into local error state
  useEffect(() => {
    if (batchError) {
      setError(batchError);
    }
  }, [batchError]);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      setError("");
      setDecisions({});
      await batchUpload(files);
    },
    [batchUpload]
  );

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      void handleUploadFiles(Array.from(fileList));
    }
    // Reset input so the same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const fileList = e.dataTransfer.files;
    if (fileList.length > 0) {
      void handleUploadFiles(Array.from(fileList));
    }
  }

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  function handleDecision(importLogId: string, index: number, action: FlaggedDecision) {
    setDecisions((prev) => ({
      ...prev,
      [importLogId]: { ...prev[importLogId], [index]: action },
    }));
  }

  function allFlaggedDecidedFor(importLogId: string, flagged: FlaggedItem[]): boolean {
    const fileDecisions = decisions[importLogId];
    if (!fileDecisions) return false;
    return flagged.every((_, i) => fileDecisions[i] !== undefined);
  }

  async function handleResolve(importLogId: string, flagged: FlaggedItem[]) {
    const fileDecisions = decisions[importLogId];
    if (!fileDecisions) return;

    const allDecided = flagged.every(
      (_, i) => fileDecisions[i] !== undefined
    );
    if (!allDecided) return;

    setResolving(importLogId);
    setError("");

    try {
      const resolveDecisions = flagged.map((item, i) => ({
        transaction: item.transaction,
        action: fileDecisions[i],
      }));

      const res = await fetch("/api/import/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importLogId,
          decisions: resolveDecisions,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to resolve flagged transactions");
        return;
      }

      // Clear decisions for this file — the flaggedData will be stale but
      // we mark it resolved locally
      setDecisions((prev) => {
        const next = { ...prev };
        delete next[importLogId];
        return next;
      });
    } catch (err) {
      logError("failed to resolve flagged transactions", err);
      setError("Failed to resolve flagged transactions. Please try again.");
    } finally {
      setResolving(null);
    }
  }

  function handleUploadMore() {
    resetBatch();
    setDecisions({});
    setError("");
  }

  // Compute totals from batch
  const totalFound = batch?.totalTransactionsFound ?? 0;
  const totalImported = batch?.totalTransactionsImported ?? 0;
  const totalSkipped = batch?.totalDuplicatesSkipped ?? 0;
  const totalFlagged = batch?.totalDuplicatesFlagged ?? 0;

  // Extract flagged items per file from batch
  const filesWithFlagged = batch?.files
    .filter((f) => f.flaggedData && Array.isArray(f.flaggedData) && (f.flaggedData as FlaggedItem[]).length > 0)
    .map((f) => ({
      importLogId: f.importLogId ?? f.id,
      fileName: f.fileName,
      flagged: f.flaggedData as FlaggedItem[],
    })) ?? [];

  const hasFlagged = filesWithFlagged.length > 0;

  const showUploadZone = !isUploading && !isProcessing && !isComplete;
  const showProcessing = isUploading || isProcessing;

  const progressPercent = batch
    ? Math.round((batch.filesCompleted / batch.fileCount) * 100)
    : 0;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title} data-testid="page-title">Import Statements</h1>
          <Link href="/import/history" className={styles.historyLink}>
            Import history
          </Link>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {showUploadZone && (
          <div
            className={`${styles.dropZone}${dragActive ? ` ${styles.dropZoneActive}` : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid="drop-zone"
          >
            <p className={styles.dropZoneTitle}>
              Drop your statement files here
            </p>
            <p className={styles.dropZoneDescription}>
              Supports CSV, OFX, and PDF formats. You can select multiple files.
            </p>
            <button
              type="button"
              className={styles.browseButton}
              onClick={handleBrowseClick}
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.ofx,.qfx,.pdf"
              multiple
              className={styles.hiddenInput}
              onChange={handleFileSelect}
              data-testid="file-input"
            />
          </div>
        )}

        {showProcessing && (
          <div className={styles.uploading}>
            {isUploading ? (
              <p className={styles.uploadingText}>Uploading files...</p>
            ) : (
              <>
                <p className={styles.uploadingText}>Processing your statements...</p>
                {batch && (
                  <>
                    <ul className={styles.fileStatusList}>
                      {batch.files.map((file: BatchFileStatus) => (
                        <li
                          key={file.id}
                          className={`${styles.fileStatusItem} ${styles[`fileStatus_${file.status}`] ?? ""}`}
                        >
                          <span className={styles.fileStatusIcon}>
                            {fileStatusIcon(file.status)}
                          </span>
                          <span className={styles.fileStatusName}>
                            {file.fileName}
                          </span>
                          <span className={styles.fileStatusFormat}>
                            {FORMAT_LABELS[file.format] ?? file.format}
                          </span>
                          {file.status === "failed" && file.errorMessage && (
                            <span className={styles.fileStatusError}>
                              {file.errorMessage}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {isComplete && batch && (
          <>
            <div className={styles.summary}>
              <h2 className={styles.summaryTitle}>Import Complete</h2>
              <div className={styles.summaryStats}>
                {batch.fileCount > 1 ? (
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatLabel}>Files</span>
                    <span className={styles.summaryStatValue}>
                      {batch.files.map((f) => f.fileName).join(", ")}
                    </span>
                  </div>
                ) : (
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatLabel}>File</span>
                    <span className={styles.summaryStatValue}>
                      {batch.files[0]?.fileName}
                    </span>
                  </div>
                )}
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>
                    Transactions found
                  </span>
                  <span className={styles.summaryStatValue}>
                    {totalFound}
                  </span>
                </div>
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>Imported</span>
                  <span className={styles.summaryStatValue}>
                    {totalImported}
                  </span>
                </div>
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>
                    Duplicates skipped
                  </span>
                  <span className={styles.summaryStatValue}>
                    {totalSkipped}
                  </span>
                </div>
                {totalFlagged > 0 && (
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatLabel}>
                      Flagged for review
                    </span>
                    <span className={styles.summaryStatValue}>
                      {totalFlagged}
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.summaryActions}>
                <button
                  type="button"
                  className={styles.uploadAnotherButton}
                  onClick={handleUploadMore}
                >
                  Upload more files
                </button>
              </div>
            </div>

            {hasFlagged && filesWithFlagged.map((fileGroup) => (
              <div key={fileGroup.importLogId} className={styles.flaggedSection}>
                <h3 className={styles.flaggedTitle}>
                  Review flagged transactions{batch.fileCount > 1 ? ` — ${fileGroup.fileName}` : ""}
                </h3>
                <p className={styles.flaggedDescription}>
                  These transactions are similar to existing records. Choose
                  whether to keep or skip each one.
                </p>
                <ul className={styles.flaggedList}>
                  {fileGroup.flagged.map((item, index) => (
                    <li key={index} className={styles.flaggedItem}>
                      <div className={styles.flaggedItemHeader}>
                        <div className={styles.flaggedItemInfo}>
                          <span className={styles.flaggedItemDescription}>
                            {item.transaction.description}
                          </span>
                          <span className={styles.flaggedItemDetail}>
                            ${item.transaction.amount.toFixed(2)} &middot;{" "}
                            {formatDate(item.transaction.date)} &middot;{" "}
                            {item.transaction.type}
                          </span>
                          {item.matchedExisting && (
                            <span className={styles.flaggedMatch}>
                              Similar to: {item.matchedExisting.description} ($
                              {item.matchedExisting.amount.toFixed(2)})
                            </span>
                          )}
                        </div>
                        <div className={styles.flaggedItemActions}>
                          <button
                            type="button"
                            className={styles.keepButton}
                            onClick={() => handleDecision(fileGroup.importLogId, index, "keep")}
                            aria-pressed={decisions[fileGroup.importLogId]?.[index] === "keep"}
                            style={
                              decisions[fileGroup.importLogId]?.[index] === "keep"
                                ? { fontWeight: 700 }
                                : undefined
                            }
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className={styles.skipButton}
                            onClick={() => handleDecision(fileGroup.importLogId, index, "skip")}
                            aria-pressed={decisions[fileGroup.importLogId]?.[index] === "skip"}
                            style={
                              decisions[fileGroup.importLogId]?.[index] === "skip"
                                ? { fontWeight: 700 }
                                : undefined
                            }
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={styles.resolveButton}
                  onClick={() => void handleResolve(fileGroup.importLogId, fileGroup.flagged)}
                  disabled={
                    !allFlaggedDecidedFor(fileGroup.importLogId, fileGroup.flagged) ||
                    resolving === fileGroup.importLogId
                  }
                >
                  {resolving === fileGroup.importLogId ? "Resolving..." : "Resolve flagged transactions"}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
