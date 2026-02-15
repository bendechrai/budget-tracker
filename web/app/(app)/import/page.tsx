"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import styles from "./import.module.css";
import { logError } from "@/lib/logging";

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

interface ImportSummary {
  fileName: string;
  format: string;
  transactionsFound: number;
  transactionsImported: number;
  duplicatesSkipped: number;
  duplicatesFlagged: number;
  flagged: FlaggedItem[];
  importLogId: string;
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

export default function ImportPage() {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [summaries, setSummaries] = useState<ImportSummary[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Record<number, FlaggedDecision>>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFiles = useCallback(async (files: File[]) => {
    setError("");
    setSummaries([]);
    setDecisions({});
    setUploading(true);

    const results: ImportSummary[] = [];

    for (let i = 0; i < files.length; i++) {
      setUploadProgress(
        files.length > 1
          ? `Uploading file ${i + 1} of ${files.length} (${files[i].name})...`
          : "Uploading and processing..."
      );

      try {
        const formData = new FormData();
        formData.append("file", files[i]);

        const res = await fetch("/api/import/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          setError(data.error || `Upload failed for ${files[i].name}`);
          // Continue with remaining files
          continue;
        }

        const data = (await res.json()) as ImportSummary;
        results.push(data);
      } catch (err) {
        logError("failed to upload import file", err);
        setError(`Upload failed for ${files[i].name}. Please try again.`);
      }
    }

    setSummaries(results);
    setUploadProgress("");
    setUploading(false);
  }, []);

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

  function allFlaggedDecidedFor(s: ImportSummary): boolean {
    const fileDecisions = decisions[s.importLogId];
    if (!fileDecisions) return false;
    return s.flagged.every((_, i) => fileDecisions[i] !== undefined);
  }

  async function handleResolve(s: ImportSummary) {
    const fileDecisions = decisions[s.importLogId];
    if (!fileDecisions) return;

    const allDecided = s.flagged.every(
      (_, i) => fileDecisions[i] !== undefined
    );
    if (!allDecided) return;

    setResolving(s.importLogId);
    setError("");

    try {
      const resolveDecisions = s.flagged.map((item, i) => ({
        transaction: item.transaction,
        action: fileDecisions[i],
      }));

      const res = await fetch("/api/import/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importLogId: s.importLogId,
          decisions: resolveDecisions,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to resolve flagged transactions");
        return;
      }

      const result = (await res.json()) as { kept: number; skipped: number };

      setSummaries((prev) =>
        prev.map((item) =>
          item.importLogId === s.importLogId
            ? {
                ...item,
                transactionsImported: item.transactionsImported + result.kept,
                duplicatesSkipped: item.duplicatesSkipped + result.skipped,
                duplicatesFlagged: 0,
                flagged: [],
              }
            : item
        )
      );
      setDecisions((prev) => {
        const next = { ...prev };
        delete next[s.importLogId];
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
    setSummaries([]);
    setDecisions({});
    setError("");
  }

  const totalFound = summaries.reduce((sum, s) => sum + s.transactionsFound, 0);
  const totalImported = summaries.reduce((sum, s) => sum + s.transactionsImported, 0);
  const totalSkipped = summaries.reduce((sum, s) => sum + s.duplicatesSkipped, 0);
  const totalFlagged = summaries.reduce((sum, s) => sum + s.duplicatesFlagged, 0);
  const hasFlagged = summaries.some((s) => s.flagged.length > 0);

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

        {!uploading && summaries.length === 0 && (
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

        {uploading && (
          <div className={styles.uploading}>
            <p className={styles.uploadingText}>{uploadProgress}</p>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}

        {summaries.length > 0 && (
          <>
            <div className={styles.summary}>
              <h2 className={styles.summaryTitle}>Import Complete</h2>
              <div className={styles.summaryStats}>
                {summaries.length > 1 && (
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatLabel}>Files</span>
                    <span className={styles.summaryStatValue}>
                      {summaries.map((s) => s.fileName).join(", ")}
                    </span>
                  </div>
                )}
                {summaries.length === 1 && (
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatLabel}>File</span>
                    <span className={styles.summaryStatValue}>
                      {summaries[0].fileName}
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

            {hasFlagged && summaries.filter((s) => s.flagged.length > 0).map((s) => (
              <div key={s.importLogId} className={styles.flaggedSection}>
                <h3 className={styles.flaggedTitle}>
                  Review flagged transactions{summaries.length > 1 ? ` — ${s.fileName}` : ""}
                </h3>
                <p className={styles.flaggedDescription}>
                  These transactions are similar to existing records. Choose
                  whether to keep or skip each one.
                </p>
                <ul className={styles.flaggedList}>
                  {s.flagged.map((item, index) => (
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
                          <span className={styles.flaggedMatch}>
                            Similar to: {item.matchedExisting.description} ($
                            {item.matchedExisting.amount.toFixed(2)})
                          </span>
                        </div>
                        <div className={styles.flaggedItemActions}>
                          <button
                            type="button"
                            className={styles.keepButton}
                            onClick={() => handleDecision(s.importLogId, index, "keep")}
                            aria-pressed={decisions[s.importLogId]?.[index] === "keep"}
                            style={
                              decisions[s.importLogId]?.[index] === "keep"
                                ? { fontWeight: 700 }
                                : undefined
                            }
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className={styles.skipButton}
                            onClick={() => handleDecision(s.importLogId, index, "skip")}
                            aria-pressed={decisions[s.importLogId]?.[index] === "skip"}
                            style={
                              decisions[s.importLogId]?.[index] === "skip"
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
                  onClick={() => void handleResolve(s)}
                  disabled={!allFlaggedDecidedFor(s) || resolving === s.importLogId}
                >
                  {resolving === s.importLogId ? "Resolving..." : "Resolve flagged transactions"}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
