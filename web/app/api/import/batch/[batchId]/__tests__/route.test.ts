import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockBatchFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    importBatch: {
      findUnique: (...args: unknown[]) => mockBatchFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockProcessImportBatch = vi.fn();
vi.mock("@/lib/import/batchProcessor", () => ({
  processImportBatch: (...args: unknown[]) => mockProcessImportBatch(...args),
}));

let afterCallback: (() => void) | null = null;
vi.mock("next/server", async () => {
  const actual = await vi.importActual("next/server");
  return {
    ...actual,
    after: (fn: () => void) => {
      afterCallback = fn;
    },
  };
});

import { GET } from "../route";

function makeGetRequest(batchId: string): NextRequest {
  return new NextRequest(`http://localhost/api/import/batch/${batchId}`, {
    method: "GET",
  });
}

const mockParams = (batchId: string) => Promise.resolve({ batchId });

describe("GET /api/import/batch/[batchId]", () => {
  const mockUser = { id: "user_1", email: "test@example.com" };

  const mockBatch = {
    id: "batch_1",
    userId: "user_1",
    status: "completed",
    fileCount: 2,
    filesCompleted: 2,
    totalTransactionsFound: 15,
    totalTransactionsImported: 12,
    totalDuplicatesSkipped: 3,
    totalDuplicatesFlagged: 0,
    patternDetectionComplete: true,
    errorMessage: null,
    updatedAt: new Date(),
    files: [
      {
        id: "file_1",
        position: 0,
        fileName: "a.csv",
        format: "csv",
        status: "completed",
        transactionsFound: 10,
        transactionsImported: 8,
        duplicatesSkipped: 2,
        duplicatesFlagged: 0,
        flaggedData: null,
        importLogId: "log_1",
        errorMessage: null,
      },
      {
        id: "file_2",
        position: 1,
        fileName: "b.pdf",
        format: "pdf",
        status: "completed",
        transactionsFound: 5,
        transactionsImported: 4,
        duplicatesSkipped: 1,
        duplicatesFlagged: 0,
        flaggedData: null,
        importLogId: "log_2",
        errorMessage: null,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    afterCallback = null;
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockBatchFindUnique.mockResolvedValue(mockBatch);
    mockProcessImportBatch.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeGetRequest("batch_1"), { params: mockParams("batch_1") });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 404 when batch not found", async () => {
    mockBatchFindUnique.mockResolvedValue(null);

    const res = await GET(makeGetRequest("batch_999"), { params: mockParams("batch_999") });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("batch not found");
  });

  it("returns 404 when batch belongs to different user", async () => {
    mockBatchFindUnique.mockResolvedValue({ ...mockBatch, userId: "other_user" });

    const res = await GET(makeGetRequest("batch_1"), { params: mockParams("batch_1") });

    expect(res.status).toBe(404);
  });

  it("returns batch status with per-file progress", async () => {
    const res = await GET(makeGetRequest("batch_1"), { params: mockParams("batch_1") });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.batchId).toBe("batch_1");
    expect(data.status).toBe("completed");
    expect(data.fileCount).toBe(2);
    expect(data.filesCompleted).toBe(2);
    expect(data.totalTransactionsFound).toBe(15);
    expect(data.totalTransactionsImported).toBe(12);
    expect(data.totalDuplicatesSkipped).toBe(3);
    expect(data.patternDetectionComplete).toBe(true);
    expect(data.files).toHaveLength(2);
    expect(data.files[0].fileName).toBe("a.csv");
    expect(data.files[1].fileName).toBe("b.pdf");
  });

  it("does not re-trigger processing for completed batches", async () => {
    await GET(makeGetRequest("batch_1"), { params: mockParams("batch_1") });

    expect(afterCallback).toBeNull();
  });

  it("re-triggers stale processing batch", async () => {
    const staleBatch = {
      ...mockBatch,
      status: "processing",
      updatedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 min ago
    };
    mockBatchFindUnique.mockResolvedValue(staleBatch);

    const res = await GET(makeGetRequest("batch_1"), { params: mockParams("batch_1") });

    expect(res.status).toBe(200);
    expect(afterCallback).not.toBeNull();
  });

  it("does not re-trigger recently updated processing batch", async () => {
    const recentBatch = {
      ...mockBatch,
      status: "processing",
      updatedAt: new Date(Date.now() - 30 * 1000), // 30 sec ago
    };
    mockBatchFindUnique.mockResolvedValue(recentBatch);

    const res = await GET(makeGetRequest("batch_1"), { params: mockParams("batch_1") });

    expect(res.status).toBe(200);
    expect(afterCallback).toBeNull();
  });
});
