import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBatchImport } from "../useBatchImport";
import type { BatchStatus } from "../useBatchImport";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const makeBatchResponse = (overrides: Partial<BatchStatus> = {}): BatchStatus => ({
  batchId: "batch_1",
  status: "pending",
  fileCount: 1,
  filesCompleted: 0,
  totalTransactionsFound: 0,
  totalTransactionsImported: 0,
  totalDuplicatesSkipped: 0,
  totalDuplicatesFlagged: 0,
  patternDetectionComplete: false,
  errorMessage: null,
  files: [
    {
      id: "file_1",
      position: 0,
      fileName: "test.csv",
      format: "csv",
      status: "pending",
      transactionsFound: 0,
      transactionsImported: 0,
      duplicatesSkipped: 0,
      duplicatesFlagged: 0,
      flaggedData: null,
      importLogId: null,
      errorMessage: null,
    },
  ],
  ...overrides,
});

describe("useBatchImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with default state", () => {
    const { result } = renderHook(() => useBatchImport());

    expect(result.current.batch).toBeNull();
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("uploads files and polls until complete", async () => {
    const uploadResponse = makeBatchResponse();
    const completedResponse = makeBatchResponse({
      status: "completed",
      filesCompleted: 1,
      totalTransactionsFound: 5,
      totalTransactionsImported: 5,
      patternDetectionComplete: true,
    });

    vi.mocked(global.fetch)
      // Upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(uploadResponse), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // Immediate poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { result } = renderHook(() => useBatchImport());
    const file = new File(["data"], "test.csv", { type: "text/csv" });

    await act(async () => {
      await result.current.uploadFiles([file]);
    });

    // Upload POST + immediate poll
    await waitFor(() => {
      expect(result.current.isComplete).toBe(true);
    });

    expect(result.current.batch?.totalTransactionsImported).toBe(5);
  });

  it("sets error on upload failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "files are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useBatchImport());
    const file = new File(["data"], "test.csv", { type: "text/csv" });

    await act(async () => {
      await result.current.uploadFiles([file]);
    });

    expect(result.current.error).toBe("files are required");
    expect(result.current.isUploading).toBe(false);
  });

  it("resets state", async () => {
    const completedResponse = makeBatchResponse({ status: "completed", patternDetectionComplete: true });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValue(
        new Response(JSON.stringify(completedResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { result } = renderHook(() => useBatchImport());
    const file = new File(["data"], "test.csv", { type: "text/csv" });

    await act(async () => {
      await result.current.uploadFiles([file]);
    });

    await waitFor(() => {
      expect(result.current.batch).not.toBeNull();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.batch).toBeNull();
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error on failed batch", async () => {
    const failedResponse = makeBatchResponse({
      status: "failed",
      errorMessage: "processing failed",
    });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(failedResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { result } = renderHook(() => useBatchImport());
    const file = new File(["data"], "test.csv", { type: "text/csv" });

    await act(async () => {
      await result.current.uploadFiles([file]);
    });

    await waitFor(() => {
      expect(result.current.error).toBe("processing failed");
    });

    expect(result.current.isComplete).toBe(false);
  });

  it("sends all files in a single multipart request", async () => {
    const uploadResponse = makeBatchResponse({ fileCount: 2 });
    const completedResponse = makeBatchResponse({ status: "completed", patternDetectionComplete: true });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(uploadResponse), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { result } = renderHook(() => useBatchImport());
    const file1 = new File(["data1"], "a.csv", { type: "text/csv" });
    const file2 = new File(["data2"], "b.csv", { type: "text/csv" });

    await act(async () => {
      await result.current.uploadFiles([file1, file2]);
    });

    // Only one upload POST, not two
    const uploadCall = vi.mocked(global.fetch).mock.calls[0];
    expect(uploadCall[0]).toBe("/api/import/batch");
    expect(uploadCall[1]).toEqual(
      expect.objectContaining({ method: "POST" })
    );

    // Verify FormData has both files
    const formData = (uploadCall[1] as RequestInit).body as FormData;
    const files = formData.getAll("files");
    expect(files).toHaveLength(2);
  });
});
