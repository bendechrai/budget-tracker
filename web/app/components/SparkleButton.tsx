"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./sparkle.module.css";
import { logError } from "@/lib/logging";
import type { ParseResult } from "@/lib/ai/types";

type ItemType = "income" | "obligation";

interface SparkleItem {
  id: string;
  name: string;
  amount: number;
  frequency?: string | null;
  type: ItemType;
}

interface SparkleButtonProps {
  item: SparkleItem;
  onAction?: (result: ParseResult) => void;
}

const INCOME_PRESETS = [
  { label: "Change amount", field: "amount" },
  { label: "Change frequency", field: "frequency" },
  { label: "Pause", field: "pause" },
  { label: "Delete", field: "delete" },
] as const;

const OBLIGATION_PRESETS = [
  { label: "Change amount", field: "amount" },
  { label: "Change frequency", field: "frequency" },
  { label: "Change due date", field: "dueDate" },
  { label: "Pause", field: "pause" },
  { label: "Delete", field: "delete" },
] as const;

function buildPresetIntent(
  item: SparkleItem,
  field: string
): ParseResult {
  const targetType = item.type === "income" ? "income" as const : "expense" as const;

  if (field === "delete") {
    return {
      type: "delete",
      targetType,
      targetName: item.name,
      confidence: "high",
    };
  }

  if (field === "pause") {
    return {
      type: "edit",
      targetType,
      targetName: item.name,
      confidence: "high",
      changes: { isPaused: true },
    };
  }

  if (field === "amount") {
    return {
      type: "edit",
      targetType,
      targetName: item.name,
      confidence: "high",
      changes: { amount: item.amount },
    };
  }

  if (field === "frequency") {
    return {
      type: "edit",
      targetType,
      targetName: item.name,
      confidence: "high",
      changes: {},
    };
  }

  if (field === "dueDate") {
    return {
      type: "edit",
      targetType,
      targetName: item.name,
      confidence: "high",
      changes: {},
    };
  }

  return {
    type: "edit",
    targetType,
    targetName: item.name,
    confidence: "high",
    changes: {},
  };
}

interface AIParseResponse {
  intent: ParseResult;
  answer?: string;
}

export default function SparkleButton({ item, onAction }: SparkleButtonProps) {
  const [open, setOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ text: string; isError: boolean } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const presets = item.type === "income" ? INCOME_PRESETS : OBLIGATION_PRESETS;

  const handleOpen = useCallback(() => {
    setOpen(true);
    setFreeText("");
    setResponse(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setFreeText("");
    setResponse(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, handleClose]);

  function handlePresetClick(field: string) {
    const intent = buildPresetIntent(item, field);
    setResponse({ text: formatIntent(intent), isError: false });
    if (onAction) {
      onAction(intent);
    }
  }

  async function handleFreeTextSubmit() {
    const text = freeText.trim();
    if (!text || loading) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${text} for ${item.name}` }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string };
        setResponse({ text: errorData.error ?? "Something went wrong", isError: true });
        return;
      }

      const data = (await res.json()) as AIParseResponse;
      const intent = data.intent;
      setResponse({ text: formatIntent(intent), isError: false });
      setFreeText("");
      if (onAction) {
        onAction(intent);
      }
    } catch (err) {
      logError("sparkle button free text submit failed", err);
      setResponse({ text: "Failed to process request", isError: true });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleFreeTextSubmit();
    }
  }

  const frequencyLabel = item.frequency ?? "—";

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.sparkleButton}
        onClick={handleOpen}
        aria-label={`AI actions for ${item.name}`}
        data-testid={`sparkle-button-${item.id}`}
      >
        ✨
      </button>

      {open && (
        <div className={styles.overlay}>
          <div
            ref={modalRef}
            className={styles.modal}
            role="dialog"
            aria-label={`AI actions for ${item.name}`}
            data-testid={`sparkle-modal-${item.id}`}
          >
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>AI Actions</span>
              <button
                type="button"
                className={styles.closeButton}
                onClick={handleClose}
                aria-label="Close"
                data-testid="sparkle-close"
              >
                ×
              </button>
            </div>

            <div className={styles.summary} data-testid="sparkle-summary">
              <span className={styles.summaryName}>{item.name}</span>
              <span className={styles.summaryDetail}>
                ${item.amount.toFixed(2)} / {frequencyLabel}
              </span>
            </div>

            <div className={styles.presets} data-testid="sparkle-presets">
              {presets.map((preset) => (
                <button
                  key={preset.field}
                  type="button"
                  className={styles.presetButton}
                  onClick={() => handlePresetClick(preset.field)}
                  data-testid={`sparkle-preset-${preset.field}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {response && (
              <div
                className={response.isError ? styles.responseError : styles.responseSuccess}
                data-testid="sparkle-response"
                aria-live="polite"
              >
                {response.text}
              </div>
            )}

            <div className={styles.freeTextArea}>
              <input
                ref={inputRef}
                type="text"
                className={styles.freeTextInput}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you'd like to change"
                disabled={loading}
                aria-label="Free text input"
                data-testid="sparkle-free-text"
              />
              <button
                type="button"
                className={styles.submitButton}
                onClick={() => void handleFreeTextSubmit()}
                disabled={loading || !freeText.trim()}
                aria-label="Submit"
                data-testid="sparkle-submit"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatIntent(intent: ParseResult): string {
  if (intent.type === "clarification") return intent.message;
  if (intent.type === "unrecognized") return intent.message;
  if (intent.type === "query") return intent.question;
  if (intent.type === "create") {
    const name = intent.incomeFields?.name ?? intent.obligationFields?.name ?? "item";
    return `Create: ${name}`;
  }
  if (intent.type === "edit") return `Edit: ${intent.targetName}`;
  if (intent.type === "delete") return `Delete: ${intent.targetName}`;
  return "Action received";
}
