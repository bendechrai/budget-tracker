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
  });
}

export default function ImportPage() {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, FlaggedDecision>>({});
  const [resolving, setResolving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setError("");
    setSummary(null);
    setDecisions({});
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Upload failed");
        return;
      }

      const data = (await res.json()) as ImportSummary;
      setSummary(data);
    } catch (err) {
      logError("failed to upload import file", err);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    // Reset input so the same file can be selected again
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

    const file = e.dataTransfer.files[0];
    if (file) {
      void handleUpload(file);
    }
  }

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  function handleDecision(index: number, action: FlaggedDecision) {
    setDecisions((prev) => ({ ...prev, [index]: action }));
  }

  async function handleResolve() {
    if (!summary) return;

    const allDecided = summary.flagged.every(
      (_, i) => decisions[i] !== undefined
    );
    if (!allDecided) return;

    setResolving(true);
    setError("");

    try {
      const resolveDecisions = summary.flagged.map((item, i) => ({
        transaction: item.transaction,
        action: decisions[i],
      }));

      const res = await fetch("/api/import/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importLogId: summary.importLogId,
          decisions: resolveDecisions,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to resolve flagged transactions");
        return;
      }

      const result = (await res.json()) as { kept: number; skipped: number };

      // Update the summary to reflect resolved state
      setSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          transactionsImported: prev.transactionsImported + result.kept,
          duplicatesSkipped: prev.duplicatesSkipped + result.skipped,
          duplicatesFlagged: 0,
          flagged: [],
        };
      });
      setDecisions({});
    } catch (err) {
      logError("failed to resolve flagged transactions", err);
      setError("Failed to resolve flagged transactions. Please try again.");
    } finally {
      setResolving(false);
    }
  }

  function handleUploadAnother() {
    setSummary(null);
    setDecisions({});
    setError("");
  }

  const allFlaggedDecided =
    summary !== null &&
    summary.flagged.length > 0 &&
    summary.flagged.every((_, i) => decisions[i] !== undefined);

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

        {!uploading && !summary && (
          <div
            className={`${styles.dropZone}${dragActive ? ` ${styles.dropZoneActive}` : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid="drop-zone"
          >
            <p className={styles.dropZoneTitle}>
              Drop your statement file here
            </p>
            <p className={styles.dropZoneDescription}>
              Supports CSV and OFX formats
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
              accept=".csv,.ofx,.qfx"
              className={styles.hiddenInput}
              onChange={handleFileSelect}
              data-testid="file-input"
            />
          </div>
        )}

        {uploading && (
          <div className={styles.uploading}>
            <p className={styles.uploadingText}>Uploading and processing...</p>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}

        {summary && (
          <>
            <div className={styles.summary}>
              <h2 className={styles.summaryTitle}>Import Complete</h2>
              <div className={styles.summaryStats}>
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>File</span>
                  <span className={styles.summaryStatValue}>
                    {summary.fileName}
                  </span>
                </div>
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>
                    Transactions found
                  </span>
                  <span className={styles.summaryStatValue}>
                    {summary.transactionsFound}
                  </span>
                </div>
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>Imported</span>
                  <span className={styles.summaryStatValue}>
                    {summary.transactionsImported}
                  </span>
                </div>
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>
                    Duplicates skipped
                  </span>
                  <span className={styles.summaryStatValue}>
                    {summary.duplicatesSkipped}
                  </span>
                </div>
                {summary.duplicatesFlagged > 0 && (
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatLabel}>
                      Flagged for review
                    </span>
                    <span className={styles.summaryStatValue}>
                      {summary.duplicatesFlagged}
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.summaryActions}>
                <button
                  type="button"
                  className={styles.uploadAnotherButton}
                  onClick={handleUploadAnother}
                >
                  Upload another file
                </button>
              </div>
            </div>

            {summary.flagged.length > 0 && (
              <div className={styles.flaggedSection}>
                <h3 className={styles.flaggedTitle}>
                  Review flagged transactions
                </h3>
                <p className={styles.flaggedDescription}>
                  These transactions are similar to existing records. Choose
                  whether to keep or skip each one.
                </p>
                <ul className={styles.flaggedList}>
                  {summary.flagged.map((item, index) => (
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
                            onClick={() => handleDecision(index, "keep")}
                            aria-pressed={decisions[index] === "keep"}
                            style={
                              decisions[index] === "keep"
                                ? { fontWeight: 700 }
                                : undefined
                            }
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className={styles.skipButton}
                            onClick={() => handleDecision(index, "skip")}
                            aria-pressed={decisions[index] === "skip"}
                            style={
                              decisions[index] === "skip"
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
                  onClick={() => void handleResolve()}
                  disabled={!allFlaggedDecided || resolving}
                >
                  {resolving ? "Resolving..." : "Resolve flagged transactions"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
