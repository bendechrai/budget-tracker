"use client";

import { useState } from "react";
import { logError } from "@/lib/logging";
import styles from "./settings.module.css";
import DeleteAccountModal from "./DeleteAccountModal";

export default function AccountSection() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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

        <button
          type="button"
          className={styles.dangerButton}
          onClick={() => setShowDeleteModal(true)}
        >
          Delete Account
        </button>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />
      )}
    </>
  );
}
