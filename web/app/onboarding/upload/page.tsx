"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../onboarding.module.css";
import uploadStyles from "./upload.module.css";
import { logError } from "@/lib/logging";
import { useBatchImport } from "@/lib/hooks/useBatchImport";
import type { BatchFileStatus } from "@/lib/hooks/useBatchImport";

interface SuggestionTransaction {
  transaction: {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
  };
}

interface Suggestion {
  id: string;
  type: "income" | "expense";
  vendorPattern: string;
  detectedAmount: number;
  detectedAmountMin: number | null;
  detectedAmountMax: number | null;
  detectedIntervalUnit: string | null;
  detectedIntervalCount: number;
  confidence: "high" | "medium" | "low";
  matchingTransactionCount: number;
  status: string;
  suggestionTransactions: SuggestionTransaction[];
}

type Step = "upload" | "processing" | "suggestions" | "done";

const INTERVAL_UNIT_OPTIONS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "twice_monthly", label: "twice monthly" },
  { value: "month", label: "months" },
  { value: "quarter", label: "quarters" },
  { value: "year", label: "years" },
];

function formatInterval(unit: string | null, count: number): string {
  if (!unit) return "Irregular";
  if (unit === "twice_monthly") return "Twice monthly";
  const labels: Record<string, [string, string]> = {
    day: ["Daily", "days"],
    week: ["Weekly", "weeks"],
    month: ["Monthly", "months"],
    quarter: ["Quarterly", "quarters"],
    year: ["Annually", "years"],
  };
  const [singular, plural] = labels[unit] ?? [unit, unit + "s"];
  if (count === 1) return singular;
  return `Every ${count} ${plural}`;
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatAmountRange(
  amount: number,
  min: number | null,
  max: number | null
): string {
  if (min !== null && max !== null && min !== max) {
    return `${formatAmount(min)} – ${formatAmount(max)}`;
  }
  return formatAmount(amount);
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

export default function OnboardingUploadPage() {
  const router = useRouter();
  const {
    uploadFiles: batchUpload,
    batch,
    isUploading,
    isProcessing,
    isComplete,
    error: batchError,
    reset: resetBatch,
  } = useBatchImport();

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tweakingId, setTweakingId] = useState<string | null>(null);
  const [tweakName, setTweakName] = useState("");
  const [tweakAmount, setTweakAmount] = useState("");
  const [tweakIntervalUnit, setTweakIntervalUnit] = useState("");
  const [tweakIntervalCount, setTweakIntervalCount] = useState("1");
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync batch errors into local error state
  useEffect(() => {
    if (batchError) {
      setError(batchError);
    }
  }, [batchError]);

  // Transition to processing step when upload starts
  useEffect(() => {
    if (isUploading || isProcessing) {
      setStep("processing");
    }
  }, [isUploading, isProcessing]);

  // When batch completes, fetch suggestions
  useEffect(() => {
    if (!isComplete || !batch) return;
    if (fetchingSuggestions) return;

    // Check if any transactions were imported
    if (batch.totalTransactionsImported === 0) {
      setError("No new transactions found. Try uploading different statements.");
      setStep("upload");
      resetBatch();
      return;
    }

    // Pattern detection is done server-side in the batch processor
    // Fetch suggestions
    setFetchingSuggestions(true);

    fetch("/api/suggestions")
      .then(async (res) => {
        if (!res.ok) {
          setStep("done");
          return;
        }
        const data = (await res.json()) as {
          suggestions: Suggestion[];
          count: number;
        };

        if (data.suggestions.length === 0) {
          setStep("done");
        } else {
          setSuggestions(data.suggestions);
          setStep("suggestions");
        }
      })
      .catch((err) => {
        logError("failed to fetch suggestions during onboarding", err);
        setStep("done");
      })
      .finally(() => {
        setFetchingSuggestions(false);
      });
  }, [isComplete, batch, fetchingSuggestions, resetBatch]);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      setError("");
      await batchUpload(files);
    },
    [batchUpload]
  );

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      void handleUploadFiles(Array.from(fileList));
    }
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

  async function handleAccept(id: string) {
    setActionLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (!res.ok) {
        setError("Failed to accept suggestion");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      logError("failed to accept suggestion during onboarding", err);
      setError("Failed to accept suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDismiss(id: string) {
    setActionLoading(id);
    setError("");
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) {
        setError("Failed to dismiss suggestion");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      logError("failed to dismiss suggestion during onboarding", err);
      setError("Failed to dismiss suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  function handleStartTweak(suggestion: Suggestion) {
    setTweakingId(suggestion.id);
    setTweakName(suggestion.vendorPattern);
    setTweakAmount(suggestion.detectedAmount.toString());
    setTweakIntervalUnit(suggestion.detectedIntervalUnit ?? "month");
    setTweakIntervalCount(suggestion.detectedIntervalCount?.toString() ?? "1");
  }

  function handleCancelTweak() {
    setTweakingId(null);
    setTweakName("");
    setTweakAmount("");
    setTweakIntervalUnit("");
    setTweakIntervalCount("1");
  }

  async function handleSaveTweak(id: string) {
    const parsedAmount = parseFloat(tweakAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Amount must be a non-negative number");
      return;
    }

    const trimmedName = tweakName.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setActionLoading(id);
    setError("");
    try {
      const parsedCount = parseInt(tweakIntervalCount, 10);
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          name: trimmedName,
          amount: parsedAmount,
          intervalUnit: tweakIntervalUnit || null,
          intervalCount: isNaN(parsedCount) || parsedCount <= 0 ? 1 : parsedCount,
        }),
      });
      if (!res.ok) {
        setError("Failed to save suggestion");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      handleCancelTweak();
    } catch (err) {
      logError("failed to save tweaked suggestion during onboarding", err);
      setError("Failed to save suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  function handleContinue() {
    router.push("/onboarding/fund-setup");
  }

  const allSuggestionsHandled = suggestions.length === 0 && step === "suggestions";

  const progressPercent = batch
    ? Math.round((batch.filesCompleted / batch.fileCount) * 100)
    : 0;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Upload Bank Statements</h1>
        <p className={styles.subtitle}>
          Upload your bank statements and we&apos;ll automatically detect your
          recurring income and expenses.
        </p>

        {error && (
          <div className={uploadStyles.error} role="alert">
            {error}
          </div>
        )}

        {step === "upload" && (
          <>
            <div
              className={`${uploadStyles.dropZone}${dragActive ? ` ${uploadStyles.dropZoneActive}` : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="drop-zone"
            >
              <p className={uploadStyles.dropZoneTitle}>
                Drop your statement files here
              </p>
              <p className={uploadStyles.dropZoneDescription}>
                Supports CSV, OFX, and PDF formats. You can select multiple
                files.
              </p>
              <button
                type="button"
                className={uploadStyles.browseButton}
                onClick={handleBrowseClick}
              >
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.ofx,.qfx,.pdf"
                multiple
                className={uploadStyles.hiddenInput}
                onChange={handleFileSelect}
                data-testid="file-input"
              />
            </div>

            <div className={uploadStyles.actions}>
              <Link
                href="/onboarding/fund-setup"
                className={styles.skipLink}
              >
                Skip — I&apos;ll add these later
              </Link>
            </div>
          </>
        )}

        {step === "processing" && (
          <div className={uploadStyles.processing}>
            {isUploading ? (
              <p className={uploadStyles.processingText}>
                Uploading files...
              </p>
            ) : (
              <>
                <p className={uploadStyles.processingText}>
                  Processing your statements...
                </p>
                {batch && (
                  <>
                    <ul className={uploadStyles.fileStatusList}>
                      {batch.files.map((file: BatchFileStatus) => (
                        <li
                          key={file.id}
                          className={`${uploadStyles.fileStatusItem} ${uploadStyles[`fileStatus_${file.status}`] ?? ""}`}
                        >
                          <span className={uploadStyles.fileStatusIcon}>
                            {fileStatusIcon(file.status)}
                          </span>
                          <span className={uploadStyles.fileStatusName}>
                            {file.fileName}
                          </span>
                          <span className={uploadStyles.fileStatusFormat}>
                            {FORMAT_LABELS[file.format] ?? file.format}
                          </span>
                          {file.status === "failed" && file.errorMessage && (
                            <span className={uploadStyles.fileStatusError}>
                              {file.errorMessage}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className={uploadStyles.progressBar}>
                      <div
                        className={uploadStyles.progressFill}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className={uploadStyles.processingHint}>
                      {batch.filesCompleted} of {batch.fileCount} files processed
                    </p>
                  </>
                )}
                {!batch && (
                  <div className={uploadStyles.progressBar}>
                    <div
                      className={`${uploadStyles.progressFill} ${uploadStyles.progressIndeterminate}`}
                    />
                  </div>
                )}
              </>
            )}
            <div className={uploadStyles.actions}>
              <button
                type="button"
                className={uploadStyles.continueButton}
                onClick={handleContinue}
                data-testid="processing-continue"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === "suggestions" && suggestions.length > 0 && (
          <>
            <p className={uploadStyles.suggestionsIntro}>
              We detected {suggestions.length} recurring{" "}
              {suggestions.length === 1 ? "pattern" : "patterns"} in your
              statements. Accept, tweak, or dismiss each one.
            </p>

            <ul className={uploadStyles.list}>
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className={uploadStyles.card}>
                  <div className={uploadStyles.cardHeader}>
                    <span className={uploadStyles.vendorName}>
                      {suggestion.vendorPattern}
                    </span>
                    <span
                      className={`${uploadStyles.typeBadge} ${
                        suggestion.type === "income"
                          ? uploadStyles.typeBadgeIncome
                          : uploadStyles.typeBadgeExpense
                      }`}
                    >
                      {suggestion.type === "income" ? "Income" : "Expense"}
                    </span>
                  </div>

                  <div className={uploadStyles.cardDetails}>
                    <span className={uploadStyles.cardDetail}>
                      {formatAmountRange(
                        suggestion.detectedAmount,
                        suggestion.detectedAmountMin,
                        suggestion.detectedAmountMax
                      )}
                    </span>
                    <span className={uploadStyles.cardDetail}>
                      {formatInterval(suggestion.detectedIntervalUnit, suggestion.detectedIntervalCount)}
                    </span>
                    <span
                      className={`${uploadStyles.confidenceBadge} ${
                        suggestion.confidence === "high"
                          ? uploadStyles.confidenceHigh
                          : suggestion.confidence === "medium"
                            ? uploadStyles.confidenceMedium
                            : uploadStyles.confidenceLow
                      }`}
                    >
                      {suggestion.confidence} confidence
                    </span>
                    <span className={uploadStyles.cardDetail}>
                      {suggestion.matchingTransactionCount} transactions
                    </span>
                  </div>

                  {tweakingId === suggestion.id ? (
                    <div className={uploadStyles.tweakForm}>
                      <div className={uploadStyles.tweakFieldRow}>
                        <div className={uploadStyles.tweakField}>
                          <label
                            className={uploadStyles.tweakLabel}
                            htmlFor={`tweak-name-${suggestion.id}`}
                          >
                            Name
                          </label>
                          <input
                            id={`tweak-name-${suggestion.id}`}
                            className={uploadStyles.tweakInput}
                            type="text"
                            value={tweakName}
                            onChange={(e) => setTweakName(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className={uploadStyles.tweakFieldRow}>
                        <div className={uploadStyles.tweakField}>
                          <label
                            className={uploadStyles.tweakLabel}
                            htmlFor={`tweak-amount-${suggestion.id}`}
                          >
                            Amount
                          </label>
                          <input
                            id={`tweak-amount-${suggestion.id}`}
                            className={uploadStyles.tweakInput}
                            type="number"
                            min="0"
                            step="0.01"
                            value={tweakAmount}
                            onChange={(e) => setTweakAmount(e.target.value)}
                          />
                        </div>
                        <div className={uploadStyles.tweakField}>
                          <label
                            className={uploadStyles.tweakLabel}
                            htmlFor={`tweak-interval-count-${suggestion.id}`}
                          >
                            Every
                          </label>
                          <input
                            id={`tweak-interval-count-${suggestion.id}`}
                            className={uploadStyles.tweakInput}
                            type="number"
                            min="1"
                            step="1"
                            value={tweakIntervalCount}
                            onChange={(e) => setTweakIntervalCount(e.target.value)}
                          />
                        </div>
                        <div className={uploadStyles.tweakField}>
                          <label
                            className={uploadStyles.tweakLabel}
                            htmlFor={`tweak-interval-unit-${suggestion.id}`}
                          >
                            Unit
                          </label>
                          <select
                            id={`tweak-interval-unit-${suggestion.id}`}
                            className={uploadStyles.tweakInput}
                            value={tweakIntervalUnit}
                            onChange={(e) => setTweakIntervalUnit(e.target.value)}
                          >
                            {INTERVAL_UNIT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className={uploadStyles.tweakActions}>
                        <button
                          type="button"
                          className={uploadStyles.tweakCancelButton}
                          onClick={handleCancelTweak}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={uploadStyles.tweakSaveButton}
                          disabled={actionLoading === suggestion.id}
                          onClick={() => void handleSaveTweak(suggestion.id)}
                        >
                          {actionLoading === suggestion.id
                            ? "Saving..."
                            : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={uploadStyles.cardActions}>
                      <button
                        type="button"
                        className={uploadStyles.acceptButton}
                        disabled={actionLoading === suggestion.id}
                        onClick={() => void handleAccept(suggestion.id)}
                      >
                        {actionLoading === suggestion.id
                          ? "Accepting..."
                          : "Accept"}
                      </button>
                      <button
                        type="button"
                        className={uploadStyles.tweakButton}
                        onClick={() => handleStartTweak(suggestion)}
                      >
                        Tweak
                      </button>
                      <button
                        type="button"
                        className={uploadStyles.dismissButton}
                        disabled={actionLoading === suggestion.id}
                        onClick={() => void handleDismiss(suggestion.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className={uploadStyles.actions}>
              <button
                type="button"
                className={uploadStyles.continueButton}
                onClick={handleContinue}
              >
                Continue to fund setup
              </button>
              <Link
                href="/onboarding/fund-setup"
                className={styles.skipLink}
              >
                Skip remaining suggestions
              </Link>
            </div>
          </>
        )}

        {(step === "done" || allSuggestionsHandled) && (
          <div className={uploadStyles.doneSection}>
            <p className={uploadStyles.doneText}>
              {step === "done"
                ? "We didn\u2019t detect clear patterns \u2014 you can add income and expenses manually later."
                : "All suggestions handled!"}
            </p>
            <button
              type="button"
              className={uploadStyles.continueButton}
              onClick={handleContinue}
            >
              Continue to fund setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
