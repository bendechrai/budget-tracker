import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportPage from "../page";
import type { BatchStatus } from "@/lib/hooks/useBatchImport";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function makeBatchUploadResponse(overrides: Partial<BatchStatus> = {}): BatchStatus {
  return {
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
        fileName: "statement.csv",
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
  };
}

const mockCompletedNoFlagged: BatchStatus = {
  batchId: "batch_1",
  status: "completed",
  fileCount: 1,
  filesCompleted: 1,
  totalTransactionsFound: 5,
  totalTransactionsImported: 5,
  totalDuplicatesSkipped: 0,
  totalDuplicatesFlagged: 0,
  patternDetectionComplete: true,
  errorMessage: null,
  files: [
    {
      id: "file_1",
      position: 0,
      fileName: "statement.ofx",
      format: "ofx",
      status: "completed",
      transactionsFound: 5,
      transactionsImported: 5,
      duplicatesSkipped: 0,
      duplicatesFlagged: 0,
      flaggedData: null,
      importLogId: "log_1",
      errorMessage: null,
    },
  ],
};

const mockCompletedWithFlagged: BatchStatus = {
  batchId: "batch_1",
  status: "completed",
  fileCount: 1,
  filesCompleted: 1,
  totalTransactionsFound: 10,
  totalTransactionsImported: 7,
  totalDuplicatesSkipped: 2,
  totalDuplicatesFlagged: 1,
  patternDetectionComplete: true,
  errorMessage: null,
  files: [
    {
      id: "file_1",
      position: 0,
      fileName: "statement.csv",
      format: "csv",
      status: "completed",
      transactionsFound: 10,
      transactionsImported: 7,
      duplicatesSkipped: 2,
      duplicatesFlagged: 1,
      flaggedData: [
        {
          transaction: {
            date: "2026-01-15T00:00:00.000Z",
            description: "NETFLIX",
            amount: 22.99,
            type: "debit",
            referenceId: null,
          },
          matchedExisting: {
            referenceId: null,
            fingerprint: "abc123",
            date: "2026-01-15T00:00:00.000Z",
            amount: 22.99,
            description: "Netflix Subscription",
          },
          reason: "fuzzy match",
        },
      ],
      importLogId: "import-1",
      errorMessage: null,
    },
  ],
};

function createMockFile(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" });
}

describe("ImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the page title and upload zone", () => {
    render(<ImportPage />);

    expect(
      screen.getByRole("heading", { name: "Import Statements" })
    ).toBeDefined();
    expect(screen.getByText("Drop your statement files here")).toBeDefined();
    expect(screen.getByText(/Supports CSV, OFX, and PDF formats/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Browse files" })
    ).toBeDefined();
  });

  it("renders the import history link", () => {
    render(<ImportPage />);

    const link = screen.getByText("Import history");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/import/history");
  });

  it("renders a file input that accepts CSV, OFX, and PDF with multi-select", () => {
    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".csv,.ofx,.qfx,.pdf");
    expect(input.multiple).toBe(true);
  });

  it("shows uploading state when a file is selected", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("test.csv", "date,description,amount\n2026-01-01,Test,100");
    await user.upload(input, file);

    expect(screen.getByText("Uploading files...")).toBeDefined();
  });

  it("displays import summary after successful upload", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockCompletedNoFlagged), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.ofx", "<OFX>data</OFX>");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Import Complete")).toBeDefined();
    });

    expect(screen.getByText("statement.ofx")).toBeDefined();
    expect(screen.getByText("Transactions found")).toBeDefined();
    expect(screen.getByText("Imported")).toBeDefined();
    expect(screen.getByText("Duplicates skipped")).toBeDefined();
  });

  it("displays flagged transactions for review after upload", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockCompletedWithFlagged), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Review flagged transactions")).toBeDefined();
    });

    expect(screen.getByText("NETFLIX")).toBeDefined();
    expect(screen.getAllByText(/\$22\.99/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Netflix Subscription/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Keep" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Skip" })
    ).toBeDefined();
  });

  it("enables resolve button only after all flagged items are decided", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockCompletedWithFlagged), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Review flagged transactions")).toBeDefined();
    });

    const resolveButton = screen.getByRole("button", {
      name: "Resolve flagged transactions",
    });
    expect(resolveButton.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Keep" }));

    expect(resolveButton.hasAttribute("disabled")).toBe(false);
  });

  it("shows error when upload fails", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unsupported file format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("test.csv", "bad,data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "unsupported file format"
      );
    });
  });

  it("allows uploading another file after an import", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockCompletedNoFlagged), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.ofx", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Import Complete")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Upload more files" })
    );

    expect(screen.getByText("Drop your statement files here")).toBeDefined();
  });

  it("uses batch upload endpoint (not sequential upload)", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockCompletedNoFlagged), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ImportPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.ofx", "<OFX>data</OFX>");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Import Complete")).toBeDefined();
    });

    // First call should be to batch endpoint
    const firstCall = vi.mocked(global.fetch).mock.calls[0];
    expect(firstCall[0]).toBe("/api/import/batch");

    // Second call should be polling
    const secondCall = vi.mocked(global.fetch).mock.calls[1];
    expect(secondCall[0]).toBe("/api/import/batch/batch_1");
  });
});
