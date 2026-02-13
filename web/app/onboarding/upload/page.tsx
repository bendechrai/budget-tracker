"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../onboarding.module.css";
import uploadStyles from "./upload.module.css";
import { logError } from "@/lib/logging";

interface ImportSummary {
  fileName: string;
  format: string;
  transactionsFound: number;
  transactionsImported: number;
  duplicatesSkipped: number;
  duplicatesFlagged: number;
  flagged: unknown[];
  importLogId: string;
}

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
  detectedFrequency: string;
  confidence: "high" | "medium" | "low";
  matchingTransactionCount: number;
  status: string;
  suggestionTransactions: SuggestionTransaction[];
}

type Step = "upload" | "suggestions" | "done";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
  irregular: "Irregular",
};

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
  { value: "irregular", label: "Irregular" },
];

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

export default function OnboardingUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tweakingId, setTweakingId] = useState<string | null>(null);
  const [tweakName, setTweakName] = useState("");
  const [tweakAmount, setTweakAmount] = useState("");
  const [tweakFrequency, setTweakFrequency] = useState("");
  const [detecting, setDetecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setError("");
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
        setUploading(false);
        return;
      }

      const summary = (await res.json()) as ImportSummary;

      if (summary.transactionsImported === 0) {
        setError(
          "No new transactions found. Try uploading a different statement."
        );
        setUploading(false);
        return;
      }

      // Run pattern detection
      setUploading(false);
      setDetecting(true);

      const detectRes = await fetch("/api/patterns/detect", {
        method: "POST",
      });

      if (!detectRes.ok) {
        // Pattern detection failed, but import succeeded — move on
        setDetecting(false);
        setStep("done");
        return;
      }

      // Fetch suggestions
      const suggestionsRes = await fetch("/api/suggestions");
      if (!suggestionsRes.ok) {
        setDetecting(false);
        setStep("done");
        return;
      }

      const suggestionsData = (await suggestionsRes.json()) as {
        suggestions: Suggestion[];
        count: number;
      };

      setDetecting(false);

      if (suggestionsData.suggestions.length === 0) {
        setStep("done");
      } else {
        setSuggestions(suggestionsData.suggestions);
        setStep("suggestions");
      }
    } catch (err) {
      logError("failed to upload during onboarding", err);
      setError("Upload failed. Please try again.");
      setUploading(false);
      setDetecting(false);
    }
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleUpload(file);
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

    const file = e.dataTransfer.files[0];
    if (file) {
      void handleUpload(file);
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
    setTweakFrequency(suggestion.detectedFrequency);
  }

  function handleCancelTweak() {
    setTweakingId(null);
    setTweakName("");
    setTweakAmount("");
    setTweakFrequency("");
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
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          name: trimmedName,
          amount: parsedAmount,
          frequency: tweakFrequency,
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

        {step === "upload" && !uploading && !detecting && (
          <>
            <div
              className={`${uploadStyles.dropZone}${dragActive ? ` ${uploadStyles.dropZoneActive}` : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="drop-zone"
            >
              <p className={uploadStyles.dropZoneTitle}>
                Drop your statement file here
              </p>
              <p className={uploadStyles.dropZoneDescription}>
                Supports CSV and OFX formats
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
                accept=".csv,.ofx,.qfx"
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

        {uploading && (
          <div className={uploadStyles.processing}>
            <p className={uploadStyles.processingText}>
              Uploading and processing your statement...
            </p>
            <div className={uploadStyles.progressBar}>
              <div
                className={uploadStyles.progressFill}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}

        {detecting && (
          <div className={uploadStyles.processing}>
            <p className={uploadStyles.processingText}>
              Analyzing transactions for patterns...
            </p>
            <div className={uploadStyles.progressBar}>
              <div
                className={uploadStyles.progressFill}
                style={{ width: "100%" }}
              />
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
                      {FREQUENCY_LABELS[suggestion.detectedFrequency] ??
                        suggestion.detectedFrequency}
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
                            htmlFor={`tweak-frequency-${suggestion.id}`}
                          >
                            Frequency
                          </label>
                          <select
                            id={`tweak-frequency-${suggestion.id}`}
                            className={uploadStyles.tweakInput}
                            value={tweakFrequency}
                            onChange={(e) => setTweakFrequency(e.target.value)}
                          >
                            {FREQUENCY_OPTIONS.map((opt) => (
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
