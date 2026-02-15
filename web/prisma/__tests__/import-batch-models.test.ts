import { describe, it, expect } from "vitest";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  ImportBatchStatus,
  ImportFileStatus,
  ImportFormat,
} from "@/app/generated/prisma/client";

describe("Import batch models schema", () => {
  it("ImportBatchStatus enum has all expected values", () => {
    expect(ImportBatchStatus.pending).toBe("pending");
    expect(ImportBatchStatus.processing).toBe("processing");
    expect(ImportBatchStatus.completed).toBe("completed");
    expect(ImportBatchStatus.failed).toBe("failed");
  });

  it("ImportFileStatus enum has all expected values", () => {
    expect(ImportFileStatus.pending).toBe("pending");
    expect(ImportFileStatus.processing).toBe("processing");
    expect(ImportFileStatus.completed).toBe("completed");
    expect(ImportFileStatus.failed).toBe("failed");
  });

  it("ImportBatch model has all required fields", () => {
    const batch: Prisma.ImportBatchCreateInput = {
      user: { connect: { id: "user_1" } },
      fileCount: 2,
    };

    expect(batch.fileCount).toBe(2);
    expect(batch.user).toEqual({ connect: { id: "user_1" } });
  });

  it("ImportBatch model supports optional fields and defaults", () => {
    const batch: Prisma.ImportBatchCreateInput = {
      user: { connect: { id: "user_1" } },
      fileCount: 1,
      status: ImportBatchStatus.processing,
      filesCompleted: 1,
      totalTransactionsFound: 10,
      totalTransactionsImported: 8,
      totalDuplicatesSkipped: 2,
      totalDuplicatesFlagged: 0,
      patternDetectionComplete: true,
      errorMessage: "something went wrong",
      startedAt: new Date(),
      completedAt: new Date(),
    };

    expect(batch.status).toBe("processing");
    expect(batch.totalTransactionsFound).toBe(10);
    expect(batch.patternDetectionComplete).toBe(true);
    expect(batch.errorMessage).toBe("something went wrong");
  });

  it("ImportFile model has all required fields", () => {
    const file: Prisma.ImportFileCreateWithoutBatchInput = {
      position: 0,
      fileName: "statement.csv",
      format: ImportFormat.csv,
    };

    expect(file.position).toBe(0);
    expect(file.fileName).toBe("statement.csv");
    expect(file.format).toBe("csv");
  });

  it("ImportFile model supports optional fields", () => {
    const file: Prisma.ImportFileCreateWithoutBatchInput = {
      position: 1,
      fileName: "bank.pdf",
      format: ImportFormat.pdf,
      fileData: Buffer.from("raw bytes"),
      status: ImportFileStatus.completed,
      transactionsFound: 15,
      transactionsImported: 12,
      duplicatesSkipped: 3,
      duplicatesFlagged: 1,
      flaggedData: [{ transaction: {}, reason: "fuzzy match" }],
      importLogId: "log_1",
      errorMessage: null,
    };

    expect(file.format).toBe("pdf");
    expect(file.transactionsFound).toBe(15);
    expect(file.flaggedData).toHaveLength(1);
    expect(file.importLogId).toBe("log_1");
  });

  it("ImportBatch can be created with nested files", () => {
    const batch: Prisma.ImportBatchCreateInput = {
      user: { connect: { id: "user_1" } },
      fileCount: 2,
      files: {
        create: [
          { position: 0, fileName: "a.csv", format: ImportFormat.csv },
          { position: 1, fileName: "b.ofx", format: ImportFormat.ofx },
        ],
      },
    };

    expect(batch.files).toBeDefined();
  });

  it("ImportFormat enum has csv, ofx, and pdf values", () => {
    expect(ImportFormat.csv).toBe("csv");
    expect(ImportFormat.ofx).toBe("ofx");
    expect(ImportFormat.pdf).toBe("pdf");
  });
});
