import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatchUpdate = vi.fn();
const mockBatchFindUnique = vi.fn();
const mockFileUpdate = vi.fn();
const mockFileUpdateMany = vi.fn();
const mockFileFindMany = vi.fn();
const mockTransactionFindMany = vi.fn();
const mockTransactionCreateMany = vi.fn();
const mockImportLogCreate = vi.fn();
const mockIncomeSourceFindMany = vi.fn();
const mockObligationFindMany = vi.fn();
const mockSuggestionFindMany = vi.fn();
const mockSuggestionCreate = vi.fn();
const mockSuggestionTransactionCreateMany = vi.fn();
const mockPrismaTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    importBatch: {
      update: (...args: unknown[]) => mockBatchUpdate(...args),
      findUnique: (...args: unknown[]) => mockBatchFindUnique(...args),
    },
    importFile: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
      update: (...args: unknown[]) => mockFileUpdate(...args),
      updateMany: (...args: unknown[]) => mockFileUpdateMany(...args),
    },
    transaction: {
      findMany: (...args: unknown[]) => mockTransactionFindMany(...args),
      createMany: (...args: unknown[]) => mockTransactionCreateMany(...args),
    },
    importLog: {
      create: (...args: unknown[]) => mockImportLogCreate(...args),
    },
    incomeSource: {
      findMany: (...args: unknown[]) => mockIncomeSourceFindMany(...args),
    },
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    suggestion: {
      findMany: (...args: unknown[]) => mockSuggestionFindMany(...args),
      create: (...args: unknown[]) => mockSuggestionCreate(...args),
    },
    suggestionTransaction: {
      createMany: (...args: unknown[]) => mockSuggestionTransactionCreateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockPrismaTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockParsePDF = vi.fn();
vi.mock("@/lib/import/pdfParser", () => ({
  parsePDF: (...args: unknown[]) => mockParsePDF(...args),
}));

vi.mock("@/lib/patterns/detect", () => ({
  detectPatterns: vi.fn().mockReturnValue([]),
}));

import { processImportBatch } from "../batchProcessor";

describe("processImportBatch", () => {
  const userId = "user_1";
  const batchId = "batch_1";

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no existing transactions
    mockTransactionFindMany.mockResolvedValue([]);

    // Default: pattern detection dependencies
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockObligationFindMany.mockResolvedValue([]);
    mockSuggestionFindMany.mockResolvedValue([]);

    // Default: prisma $transaction passes through
    mockPrismaTransaction.mockImplementation(
      async (
        fn: (tx: Record<string, Record<string, (...args: unknown[]) => unknown>>) => Promise<unknown>
      ) => {
        const tx = {
          transaction: { createMany: mockTransactionCreateMany },
          importLog: { create: mockImportLogCreate },
          suggestion: { create: mockSuggestionCreate },
          suggestionTransaction: { createMany: mockSuggestionTransactionCreateMany },
        };
        mockImportLogCreate.mockResolvedValue({
          id: "log_1",
          userId,
          fileName: "test.csv",
          format: "csv",
          transactionsFound: 0,
          transactionsImported: 0,
          duplicatesSkipped: 0,
          duplicatesFlagged: 0,
        });
        return fn(tx);
      }
    );

    // Default: batch update succeeds
    mockBatchUpdate.mockResolvedValue({});
    mockFileUpdate.mockResolvedValue({});
    mockFileUpdateMany.mockResolvedValue({});
  });

  it("processes a CSV file successfully", async () => {
    const csvContent = "Date,Description,Amount,Type\n2024-01-15,Coffee,-4.50,debit\n2024-01-16,Salary,3000,credit";

    mockFileFindMany.mockResolvedValue([
      {
        id: "file_1",
        batchId,
        position: 0,
        fileName: "statement.csv",
        format: "csv",
        fileData: Buffer.from(csvContent),
        status: "pending",
      },
    ]);

    await processImportBatch(batchId, userId);

    // Should mark batch as processing
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: batchId },
        data: expect.objectContaining({ status: "processing" }),
      })
    );

    // Should mark file as processing then completed
    expect(mockFileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file_1" },
        data: expect.objectContaining({ status: "processing" }),
      })
    );
    expect(mockFileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file_1" },
        data: expect.objectContaining({ status: "completed" }),
      })
    );

    // Should create transactions
    expect(mockTransactionCreateMany).toHaveBeenCalledTimes(1);

    // Should mark batch as completed
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: batchId },
        data: expect.objectContaining({ status: "completed", patternDetectionComplete: true }),
      })
    );

    // Should clean up file data
    expect(mockFileUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId, status: "completed" },
        data: { fileData: null },
      })
    );
  });

  it("processes a PDF file using parsePDF", async () => {
    mockParsePDF.mockResolvedValue({
      transactions: [
        { date: new Date("2024-01-15"), description: "Coffee", amount: 4.5, type: "debit", referenceId: null },
      ],
      lowConfidenceTransactions: [],
    });

    mockFileFindMany.mockResolvedValue([
      {
        id: "file_1",
        batchId,
        position: 0,
        fileName: "statement.pdf",
        format: "pdf",
        fileData: Buffer.from("fake pdf"),
        status: "pending",
      },
    ]);

    await processImportBatch(batchId, userId);

    expect(mockParsePDF).toHaveBeenCalledTimes(1);
    expect(mockTransactionCreateMany).toHaveBeenCalledTimes(1);
  });

  it("handles file processing failure gracefully and continues", async () => {
    const csvContent = "Date,Description,Amount,Type\n2024-01-15,Coffee,-4.50,debit";

    mockFileFindMany.mockResolvedValue([
      {
        id: "file_1",
        batchId,
        position: 0,
        fileName: "bad.pdf",
        format: "pdf",
        fileData: Buffer.from("bad data"),
        status: "pending",
      },
      {
        id: "file_2",
        batchId,
        position: 1,
        fileName: "good.csv",
        format: "csv",
        fileData: Buffer.from(csvContent),
        status: "pending",
      },
    ]);

    mockParsePDF.mockRejectedValue(new Error("PDF parse failed"));

    await processImportBatch(batchId, userId);

    // First file should be marked as failed
    expect(mockFileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file_1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "PDF parse failed",
        }),
      })
    );

    // Second file should still be processed
    expect(mockFileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file_2" },
        data: expect.objectContaining({ status: "completed" }),
      })
    );

    // Batch should complete
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: batchId },
        data: expect.objectContaining({ status: "completed" }),
      })
    );
  });

  it("marks batch as failed on catastrophic error", async () => {
    mockFileFindMany.mockRejectedValue(new Error("database down"));

    await processImportBatch(batchId, userId);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: batchId },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "database down",
        }),
      })
    );
  });

  it("handles file with missing fileData", async () => {
    mockFileFindMany.mockResolvedValue([
      {
        id: "file_1",
        batchId,
        position: 0,
        fileName: "empty.csv",
        format: "csv",
        fileData: null,
        status: "pending",
      },
    ]);

    await processImportBatch(batchId, userId);

    expect(mockFileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file_1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "file data is missing",
        }),
      })
    );
  });

  it("deduplicates across files within the same batch", async () => {
    // Same transaction in two files — second should be deduped
    const csvContent = "Date,Description,Amount,Type\n2024-01-15,Coffee,-4.50,debit";

    mockFileFindMany.mockResolvedValue([
      {
        id: "file_1",
        batchId,
        position: 0,
        fileName: "file1.csv",
        format: "csv",
        fileData: Buffer.from(csvContent),
        status: "pending",
      },
      {
        id: "file_2",
        batchId,
        position: 1,
        fileName: "file2.csv",
        format: "csv",
        fileData: Buffer.from(csvContent),
        status: "pending",
      },
    ]);

    await processImportBatch(batchId, userId);

    // Both files should be processed
    const completedCalls = mockFileUpdate.mock.calls.filter(
      (call: unknown[]) => {
        const arg = call[0] as { data: { status: string } };
        return arg.data.status === "completed";
      }
    );
    expect(completedCalls).toHaveLength(2);

    // First file creates transactions, second should skip duplicates
    expect(mockTransactionCreateMany).toHaveBeenCalledTimes(1);
  });
});
