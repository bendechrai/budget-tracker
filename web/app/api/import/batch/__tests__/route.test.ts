import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockBatchCreate = vi.fn();
const mockBatchFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    importBatch: {
      create: (...args: unknown[]) => mockBatchCreate(...args),
      findFirst: (...args: unknown[]) => mockBatchFindFirst(...args),
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

// Capture the after() callback instead of running it
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

import { GET, POST } from "../route";

function makeFileLike(content: string, fileName: string): File {
  return {
    name: fileName,
    size: content.length,
    type: "application/octet-stream",
    text: () => Promise.resolve(content),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
    slice: () => new Blob(),
    stream: () => new ReadableStream(),
    lastModified: Date.now(),
  } as unknown as File;
}

function makeBatchRequest(files: File[]): NextRequest {
  const req = new NextRequest("http://localhost/api/import/batch", {
    method: "POST",
  });
  vi.spyOn(req, "formData").mockResolvedValue({
    getAll: (key: string) => (key === "files" ? files : []),
    get: () => null,
  } as unknown as FormData);
  return req;
}

function makeEmptyBatchRequest(): NextRequest {
  const req = new NextRequest("http://localhost/api/import/batch", {
    method: "POST",
  });
  vi.spyOn(req, "formData").mockResolvedValue({
    getAll: () => [],
    get: () => null,
  } as unknown as FormData);
  return req;
}

describe("POST /api/import/batch", () => {
  const mockUser = { id: "user_1", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    afterCallback = null;
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockProcessImportBatch.mockResolvedValue(undefined);

    mockBatchCreate.mockResolvedValue({
      id: "batch_1",
      status: "pending",
      fileCount: 1,
      files: [
        {
          id: "file_1",
          position: 0,
          fileName: "statement.csv",
          format: "csv",
          status: "pending",
        },
      ],
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = makeBatchRequest([makeFileLike("data", "test.csv")]);

    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when no files are provided", async () => {
    const req = makeEmptyBatchRequest();

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("at least one file is required");
  });

  it("returns 400 for unsupported file format", async () => {
    const req = makeBatchRequest([makeFileLike("data", "test.txt")]);

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("unsupported file format");
    expect(data.error).toContain("test.txt");
  });

  it("returns 400 for empty file", async () => {
    const emptyFile = makeFileLike("", "empty.csv");
    const req = makeBatchRequest([emptyFile]);

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("empty.csv");
    expect(data.error).toContain("empty");
  });

  it("rejects entire batch if any file is invalid", async () => {
    const req = makeBatchRequest([
      makeFileLike("good data", "good.csv"),
      makeFileLike("bad data", "bad.txt"),
    ]);

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockBatchCreate).not.toHaveBeenCalled();
  });

  it("creates batch with 202 status and triggers background processing", async () => {
    const req = makeBatchRequest([
      makeFileLike("csv data", "statement.csv"),
    ]);

    const res = await POST(req);

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.batchId).toBe("batch_1");
    expect(data.status).toBe("pending");
    expect(data.fileCount).toBe(1);
    expect(data.files).toHaveLength(1);
    expect(data.files[0].fileName).toBe("statement.csv");

    expect(mockBatchCreate).toHaveBeenCalledTimes(1);

    // Verify after() was registered
    expect(afterCallback).not.toBeNull();
  });

  it("creates batch with multiple files", async () => {
    mockBatchCreate.mockResolvedValue({
      id: "batch_2",
      status: "pending",
      fileCount: 3,
      files: [
        { id: "file_1", position: 0, fileName: "a.csv", format: "csv", status: "pending" },
        { id: "file_2", position: 1, fileName: "b.ofx", format: "ofx", status: "pending" },
        { id: "file_3", position: 2, fileName: "c.pdf", format: "pdf", status: "pending" },
      ],
    });

    const req = makeBatchRequest([
      makeFileLike("csv data", "a.csv"),
      makeFileLike("ofx data", "b.ofx"),
      makeFileLike("pdf data", "c.pdf"),
    ]);

    const res = await POST(req);

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.fileCount).toBe(3);
    expect(data.files).toHaveLength(3);
  });

  it("supports QFX file extension", async () => {
    mockBatchCreate.mockResolvedValue({
      id: "batch_1",
      status: "pending",
      fileCount: 1,
      files: [
        { id: "file_1", position: 0, fileName: "stmt.qfx", format: "ofx", status: "pending" },
      ],
    });

    const req = makeBatchRequest([makeFileLike("qfx data", "stmt.qfx")]);

    const res = await POST(req);

    expect(res.status).toBe(202);
  });
});

describe("GET /api/import/batch", () => {
  const mockUser = { id: "user_1", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    afterCallback = null;
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockProcessImportBatch.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns { batch: null } when no active batch exists", async () => {
    mockBatchFindFirst.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.batch).toBeNull();
  });

  it("returns active batch when one exists", async () => {
    mockBatchFindFirst.mockResolvedValue({
      id: "batch_1",
      userId: "user_1",
      status: "processing",
      fileCount: 1,
      filesCompleted: 0,
      totalTransactionsFound: 0,
      totalTransactionsImported: 0,
      totalDuplicatesSkipped: 0,
      totalDuplicatesFlagged: 0,
      patternDetectionComplete: false,
      errorMessage: null,
      updatedAt: new Date(),
      files: [
        {
          id: "file_1",
          position: 0,
          fileName: "test.csv",
          format: "csv",
          status: "processing",
          transactionsFound: 0,
          transactionsImported: 0,
          duplicatesSkipped: 0,
          duplicatesFlagged: 0,
          flaggedData: null,
          importLogId: null,
          errorMessage: null,
        },
      ],
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.batch).not.toBeNull();
    expect(data.batch.batchId).toBe("batch_1");
    expect(data.batch.status).toBe("processing");
    expect(data.batch.files).toHaveLength(1);
  });

  it("re-triggers stale processing batch", async () => {
    const staleDate = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    mockBatchFindFirst.mockResolvedValue({
      id: "batch_stale",
      userId: "user_1",
      status: "processing",
      fileCount: 1,
      filesCompleted: 0,
      totalTransactionsFound: 0,
      totalTransactionsImported: 0,
      totalDuplicatesSkipped: 0,
      totalDuplicatesFlagged: 0,
      patternDetectionComplete: false,
      errorMessage: null,
      updatedAt: staleDate,
      files: [],
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(afterCallback).not.toBeNull();

    // Execute the after callback and verify it triggers reprocessing
    afterCallback!();
    expect(mockProcessImportBatch).toHaveBeenCalledWith("batch_stale", "user_1");
  });

  it("does not re-trigger fresh processing batch", async () => {
    mockBatchFindFirst.mockResolvedValue({
      id: "batch_fresh",
      userId: "user_1",
      status: "processing",
      fileCount: 1,
      filesCompleted: 0,
      totalTransactionsFound: 0,
      totalTransactionsImported: 0,
      totalDuplicatesSkipped: 0,
      totalDuplicatesFlagged: 0,
      patternDetectionComplete: false,
      errorMessage: null,
      updatedAt: new Date(), // just now
      files: [],
    });

    await GET();

    expect(afterCallback).toBeNull();
  });
});
