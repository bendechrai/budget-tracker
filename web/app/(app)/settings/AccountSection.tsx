"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { logError } from "@/lib/logging";
import styles from "./settings.module.css";

export default function AccountSection() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExportError("");
    setExporting(true);
    try {
      const res = await fetch("/api/user/export", { method: "POST" });
      if (!res.ok) {
        setExportError("Failed to export data");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      logError("failed to export data", err);
      setExportError("Failed to export data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDeleteError("");

    if (deleteConfirmation !== "DELETE") {
      setDeleteError("You must type DELETE to confirm");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setDeleteError(data.error || "Failed to delete account");
        return;
      }

      router.push("/");
    } catch (err) {
      logError("failed to delete account", err);
      setDeleteError("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={styles.form}>
        <h3 className={styles.formTitle}>Export Data</h3>
        <p className={styles.hint}>
          Download all your data as CSV files in a zip archive.
        </p>

        {exportError && (
          <div className={styles.formError} role="alert">
            {exportError}
          </div>
        )}

        <button
          type="button"
          className={styles.submitButton}
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export Data"}
        </button>
      </div>

      <div className={styles.form}>
        <h3 className={styles.formTitle}>Delete Account</h3>
        <p className={styles.dangerHint}>
          This will permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {deleteError && (
          <div className={styles.formError} role="alert">
            {deleteError}
          </div>
        )}

        <form onSubmit={(e) => void handleDeleteAccount(e)}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="delete-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              className={styles.input}
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="DELETE"
            />
          </div>

          <button
            type="submit"
            className={styles.dangerButton}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Account"}
          </button>
        </form>
      </div>
    </>
  );
}
