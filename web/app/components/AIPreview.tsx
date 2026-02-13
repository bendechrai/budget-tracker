"use client";

import { useState, useCallback } from "react";
import styles from "./ai-preview.module.css";
import { logError } from "@/lib/logging";
import type {
  ParseResult,
  CreateIntent,
  EditIntent,
  DeleteIntent,
  EditFields,
} from "@/lib/ai/types";

interface AIPreviewProps {
  intent: CreateIntent | EditIntent | DeleteIntent;
  onDone?: () => void;
  onCancel?: () => void;
}

type ActionStatus = { type: "idle" } | { type: "loading" } | { type: "success"; message: string } | { type: "error"; message: string };

function formatFrequency(freq: string | undefined | null): string {
  if (!freq) return "—";
  return freq.replace(/_/g, " ");
}

function formatAmount(amount: number | undefined | null): string {
  if (amount == null) return "—";
  return `$${amount.toFixed(2)}`;
}

function getTitle(intent: ParseResult): string {
  if (intent.type === "create") return "Create Preview";
  if (intent.type === "edit") return "Edit Preview";
  if (intent.type === "delete") return "Delete Confirmation";
  return "Preview";
}

function CreatePreview({ intent }: { intent: CreateIntent }) {
  if (intent.targetType === "income" && intent.incomeFields) {
    const f = intent.incomeFields;
    return (
      <div data-testid="ai-preview-create">
        <p className={styles.sectionLabel}>New Income Source</p>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Name</span>
          <span className={styles.fieldValue} data-testid="preview-field-name">{f.name}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Amount</span>
          <span className={styles.fieldValue} data-testid="preview-field-amount">{formatAmount(f.expectedAmount)}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Frequency</span>
          <span className={styles.fieldValue} data-testid="preview-field-frequency">{formatFrequency(f.frequency)}</span>
        </div>
        {f.nextExpectedDate && (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Next Expected</span>
            <span className={styles.fieldValue}>{f.nextExpectedDate}</span>
          </div>
        )}
      </div>
    );
  }

  if (intent.targetType === "expense" && intent.obligationFields) {
    const f = intent.obligationFields;
    return (
      <div data-testid="ai-preview-create">
        <p className={styles.sectionLabel}>New Obligation</p>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Name</span>
          <span className={styles.fieldValue} data-testid="preview-field-name">{f.name}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Amount</span>
          <span className={styles.fieldValue} data-testid="preview-field-amount">{formatAmount(f.amount)}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Type</span>
          <span className={styles.fieldValue} data-testid="preview-field-type">{f.type.replace(/_/g, " ")}</span>
        </div>
        {f.frequency && (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Frequency</span>
            <span className={styles.fieldValue} data-testid="preview-field-frequency">{formatFrequency(f.frequency)}</span>
          </div>
        )}
        {f.nextDueDate && (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Next Due</span>
            <span className={styles.fieldValue}>{f.nextDueDate}</span>
          </div>
        )}
        {f.customEntries && f.customEntries.length > 0 && (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Custom Entries</span>
            <span className={styles.fieldValue}>{f.customEntries.length} entries</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function EditPreview({ intent }: { intent: EditIntent }) {
  const changes = intent.changes;
  const entries = Object.entries(changes).filter(
    ([, v]) => v !== undefined
  ) as Array<[keyof EditFields, string | number | boolean]>;

  return (
    <div data-testid="ai-preview-edit">
      <p className={styles.sectionLabel}>Changes to &ldquo;{intent.targetName}&rdquo;</p>
      {entries.map(([key, value]) => (
        <div key={key} className={styles.diffRow}>
          <span className={styles.diffLabel}>{formatFieldName(key)}</span>
          <div className={styles.diffValues}>
            <span className={styles.diffArrow}>&rarr;</span>
            <span className={styles.diffNew} data-testid={`preview-change-${key}`}>
              {formatFieldValue(key, value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeletePreview({ intent }: { intent: DeleteIntent }) {
  const label = intent.targetType === "income" ? "income source" : "obligation";
  return (
    <div data-testid="ai-preview-delete">
      <p className={styles.deleteMessage}>
        Are you sure you want to delete the {label}{" "}
        <span className={styles.deleteItemName}>&ldquo;{intent.targetName}&rdquo;</span>?
      </p>
    </div>
  );
}

function formatFieldName(key: string): string {
  const map: Record<string, string> = {
    name: "Name",
    amount: "Amount",
    frequency: "Frequency",
    frequencyDays: "Frequency days",
    isPaused: "Paused",
    nextDueDate: "Next due date",
  };
  return map[key] ?? key;
}

function formatFieldValue(key: string, value: string | number | boolean): string {
  if (key === "amount" && typeof value === "number") return formatAmount(value);
  if (key === "frequency" && typeof value === "string") return formatFrequency(value);
  if (key === "isPaused" && typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

async function executeCreateIntent(intent: CreateIntent): Promise<string> {
  if (intent.targetType === "income" && intent.incomeFields) {
    const f = intent.incomeFields;
    const res = await fetch("/api/income-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name,
        expectedAmount: f.expectedAmount,
        frequency: f.frequency,
        frequencyDays: f.frequencyDays ?? null,
        isIrregular: f.isIrregular ?? false,
        nextExpectedDate: f.nextExpectedDate ?? null,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to create income source");
    }
    return `Created income source "${f.name}"`;
  }

  if (intent.targetType === "expense" && intent.obligationFields) {
    const f = intent.obligationFields;
    const res = await fetch("/api/obligations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name,
        type: f.type,
        amount: f.amount,
        frequency: f.frequency ?? null,
        frequencyDays: f.frequencyDays ?? null,
        startDate: f.startDate ?? new Date().toISOString(),
        nextDueDate: f.nextDueDate ?? new Date().toISOString(),
        endDate: f.endDate ?? null,
        customEntries: f.customEntries ?? null,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to create obligation");
    }
    return `Created obligation "${f.name}"`;
  }

  throw new Error("Invalid create intent");
}

async function executeEditIntent(intent: EditIntent): Promise<string> {
  const endpoint = intent.targetType === "income" ? "/api/income-sources" : "/api/obligations";

  // First, find the item by name
  const listRes = await fetch(endpoint);
  if (!listRes.ok) throw new Error("Failed to fetch items");

  const items = (await listRes.json()) as Array<{ id: string; name: string }>;
  const match = items.find(
    (item) => item.name.toLowerCase() === intent.targetName.toLowerCase()
  );
  if (!match) throw new Error(`Could not find "${intent.targetName}"`);

  const updateRes = await fetch(`${endpoint}/${match.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildUpdateBody(intent)),
  });
  if (!updateRes.ok) {
    const data = (await updateRes.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to update");
  }

  return `Updated "${intent.targetName}"`;
}

function buildUpdateBody(intent: EditIntent): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const c = intent.changes;

  if (c.name !== undefined) body.name = c.name;
  if (c.amount !== undefined) {
    if (intent.targetType === "income") {
      body.expectedAmount = c.amount;
    } else {
      body.amount = c.amount;
    }
  }
  if (c.frequency !== undefined) body.frequency = c.frequency;
  if (c.frequencyDays !== undefined) body.frequencyDays = c.frequencyDays;
  if (c.isPaused !== undefined) body.isPaused = c.isPaused;
  if (c.nextDueDate !== undefined) body.nextDueDate = c.nextDueDate;

  return body;
}

async function executeDeleteIntent(intent: DeleteIntent): Promise<string> {
  const endpoint = intent.targetType === "income" ? "/api/income-sources" : "/api/obligations";

  // First, find the item by name
  const listRes = await fetch(endpoint);
  if (!listRes.ok) throw new Error("Failed to fetch items");

  const items = (await listRes.json()) as Array<{ id: string; name: string }>;
  const match = items.find(
    (item) => item.name.toLowerCase() === intent.targetName.toLowerCase()
  );
  if (!match) throw new Error(`Could not find "${intent.targetName}"`);

  const deleteRes = await fetch(`${endpoint}/${match.id}`, {
    method: "DELETE",
  });
  if (!deleteRes.ok) {
    const data = (await deleteRes.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to delete");
  }

  return `Deleted "${intent.targetName}"`;
}

export default function AIPreview({ intent, onDone, onCancel }: AIPreviewProps) {
  const [status, setStatus] = useState<ActionStatus>({ type: "idle" });

  const handleConfirm = useCallback(async () => {
    setStatus({ type: "loading" });

    try {
      let message: string;

      if (intent.type === "create") {
        message = await executeCreateIntent(intent);
      } else if (intent.type === "edit") {
        message = await executeEditIntent(intent);
      } else {
        message = await executeDeleteIntent(intent);
      }

      setStatus({ type: "success", message });

      // Trigger engine recalculation after data changes
      try {
        await fetch("/api/engine/recalculate", { method: "POST" });
      } catch {
        // Non-critical — don't fail the action
      }

      if (onDone) onDone();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Action failed";
      logError("AI preview action failed", err);
      setStatus({ type: "error", message: errorMessage });
    }
  }, [intent, onDone]);

  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
  }, [onCancel]);

  const isLoading = status.type === "loading";
  const isComplete = status.type === "success";

  return (
    <div className={styles.overlay} data-testid="ai-preview-overlay">
      <div
        className={styles.modal}
        role="dialog"
        aria-label={getTitle(intent)}
        data-testid="ai-preview-modal"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{getTitle(intent)}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleCancel}
            aria-label="Close preview"
            data-testid="ai-preview-close"
          >
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {intent.type === "create" && <CreatePreview intent={intent} />}
          {intent.type === "edit" && <EditPreview intent={intent} />}
          {intent.type === "delete" && <DeletePreview intent={intent} />}

          {status.type === "success" && (
            <p className={styles.statusSuccess} data-testid="ai-preview-success">
              {status.message}
            </p>
          )}
          {status.type === "error" && (
            <p className={styles.statusError} data-testid="ai-preview-error">
              {status.message}
            </p>
          )}
        </div>

        {!isComplete && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleCancel}
              disabled={isLoading}
              data-testid="ai-preview-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className={intent.type === "delete" ? styles.deleteConfirmButton : styles.confirmButton}
              onClick={() => void handleConfirm()}
              disabled={isLoading}
              data-testid="ai-preview-confirm"
            >
              {isLoading ? "Processing..." : intent.type === "delete" ? "Delete" : "Confirm"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
