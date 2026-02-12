"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./history.module.css";
import { logError } from "@/lib/logging";

interface ImportLogEntry {
  id: string;
  fileName: string;
  format: "pdf" | "csv" | "ofx";
  transactionsFound: number;
  transactionsImported: number;
  duplicatesSkipped: number;
  duplicatesFlagged: number;
  importedAt: string;
}

interface ImportHistoryResponse {
  importLogs: ImportLogEntry[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(format: string): string {
  return format.toUpperCase();
}

export default function ImportHistoryPage() {
  const [importLogs, setImportLogs] = useState<ImportLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/import/history");
        if (!res.ok) {
          setError("Failed to load import history");
          return;
        }

        const data = (await res.json()) as ImportHistoryResponse;
        setImportLogs(data.importLogs);
      } catch (err) {
        logError("failed to fetch import history", err);
        setError("Failed to load import history");
      } finally {
        setLoading(false);
      }
    }

    void fetchHistory();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Import History</h1>
          <Link href="/import" className={styles.backLink}>
            Upload statements
          </Link>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading && <p className={styles.loading}>Loading...</p>}

        {!loading && importLogs.length === 0 && !error && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No imports yet</h2>
            <p className={styles.emptyDescription}>
              Upload a bank statement to see your import history here.
            </p>
          </div>
        )}

        {!loading && importLogs.length > 0 && (
          <ul className={styles.list}>
            {importLogs.map((log) => (
              <li key={log.id} className={styles.listItem}>
                <div className={styles.listItemHeader}>
                  <span className={styles.listItemFileName}>
                    {log.fileName}
                  </span>
                  <span className={styles.listItemFormat}>
                    {formatLabel(log.format)}
                  </span>
                </div>
                <div className={styles.listItemDate}>
                  {formatDate(log.importedAt)}
                </div>
                <div className={styles.listItemStats}>
                  <span className={styles.stat}>
                    <span className={styles.statLabel}>Found</span>
                    <span className={styles.statValue}>
                      {log.transactionsFound}
                    </span>
                  </span>
                  <span className={styles.stat}>
                    <span className={styles.statLabel}>Imported</span>
                    <span className={styles.statValue}>
                      {log.transactionsImported}
                    </span>
                  </span>
                  <span className={styles.stat}>
                    <span className={styles.statLabel}>Skipped</span>
                    <span className={styles.statValue}>
                      {log.duplicatesSkipped}
                    </span>
                  </span>
                  {log.duplicatesFlagged > 0 && (
                    <span className={styles.stat}>
                      <span className={styles.statLabel}>Flagged</span>
                      <span className={styles.statValue}>
                        {log.duplicatesFlagged}
                      </span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
