"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../onboarding.module.css";
import uploadStyles from "./upload.module.css";
import { useBatchImport } from "@/lib/hooks/useBatchImport";
import type { BatchFileStatus } from "@/lib/hooks/useBatchImport";

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
  } = useBatchImport();

  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive step from batch state instead of syncing via effects
  const zeroTransactions = isComplete && batch?.totalTransactionsImported === 0;
  const showProcessing = (isUploading || isProcessing || isComplete) && !zeroTransactions;
  const error = zeroTransactions
    ? "No new transactions found. Try uploading different statements."
    : batchError || "";

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
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

  function handleContinue() {
    router.push("/onboarding/fund-setup");
  }

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

        {!showProcessing && (
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

        {showProcessing && (
          <div className={uploadStyles.processing}>
            {isUploading ? (
              <p className={uploadStyles.processingText}>
                Uploading files...
              </p>
            ) : (
              <>
                <p className={uploadStyles.processingText}>
                  {isComplete
                    ? "All files processed!"
                    : "Processing your statements..."}
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
                    {!isComplete && (
                      <>
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
      </div>
    </div>
  );
}
