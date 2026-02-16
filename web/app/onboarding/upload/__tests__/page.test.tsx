import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingUploadPage from "../page";
import type { BatchStatus } from "@/lib/hooks/useBatchImport";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockSuggestions = [
  {
    id: "sug-1",
    type: "expense" as const,
    vendorPattern: "Netflix",
    detectedAmount: 22.99,
    detectedAmountMin: null,
    detectedAmountMax: null,
    detectedIntervalUnit: "month",
    detectedIntervalCount: 1,
    confidence: "high" as const,
    matchingTransactionCount: 5,
    status: "pending",
    suggestionTransactions: [],
  },
  {
    id: "sug-2",
    type: "income" as const,
    vendorPattern: "ACME Corp",
    detectedAmount: 5000,
    detectedAmountMin: 4800,
    detectedAmountMax: 5200,
    detectedIntervalUnit: "month",
    detectedIntervalCount: 1,
    confidence: "high" as const,
    matchingTransactionCount: 3,
    status: "pending",
    suggestionTransactions: [],
  },
];

/** Response for the initial GET /api/import/batch check that runs on mount */
function noActiveBatchResponse(): Response {
  return new Response(JSON.stringify({ batch: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

function makeBatchCompletedResponse(overrides: Partial<BatchStatus> = {}): BatchStatus {
  return {
    batchId: "batch_1",
    status: "completed",
    fileCount: 1,
    filesCompleted: 1,
    totalTransactionsFound: 10,
    totalTransactionsImported: 8,
    totalDuplicatesSkipped: 2,
    totalDuplicatesFlagged: 0,
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
        transactionsImported: 8,
        duplicatesSkipped: 2,
        duplicatesFlagged: 0,
        flaggedData: null,
        importLogId: "log_1",
        errorMessage: null,
      },
    ],
    ...overrides,
  };
}

function createMockFile(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" });
}

describe("OnboardingUploadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock handles any unexpected fetch calls (e.g. extra polls)
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ batch: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the upload zone with title and description", () => {
    render(<OnboardingUploadPage />);

    expect(
      screen.getByRole("heading", { name: "Upload Bank Statements" })
    ).toBeDefined();
    expect(screen.getByText("Drop your statement files here")).toBeDefined();
    expect(screen.getByText(/Supports CSV, OFX, and PDF formats/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Browse files" })
    ).toBeDefined();
  });

  it("renders a file input that accepts CSV and OFX", () => {
    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".csv,.ofx,.qfx,.pdf");
  });

  it("renders a skip link to fund setup", () => {
    render(<OnboardingUploadPage />);

    const skipLink = screen.getByRole("link", { name: /Skip/ });
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("/onboarding/fund-setup");
  });

  it("shows processing state when a file is selected", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Upload POST never resolves
      .mockReturnValueOnce(new Promise(() => {}));

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile(
      "test.csv",
      "date,description,amount\n2026-01-01,Test,100"
    );
    await user.upload(input, file);

    expect(
      screen.getByText("Uploading files...")
    ).toBeDefined();
  });

  it("shows suggestions after successful upload and processing", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Immediate poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ suggestions: mockSuggestions, count: 2 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("ACME Corp")).toBeDefined();
    expect(screen.getByText(/2 recurring patterns/)).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Tweak" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(2);
  });

  it("shows done state when no patterns detected", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions (empty)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [], count: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(
        screen.getByText(/didn.t detect clear patterns/)
      ).toBeDefined();
    });

    expect(
      screen.getByRole("button", { name: "Continue to fund setup" })
    ).toBeDefined();
  });

  it("shows error when no new transactions found", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed with 0 imported
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeBatchCompletedResponse({
              totalTransactionsImported: 0,
              totalDuplicatesSkipped: 5,
            })
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "No new transactions found. Try uploading different statements."
      );
    });
  });

  it("navigates to fund setup when continue button is clicked", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions (empty)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [], count: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Continue to fund setup" })
      ).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Continue to fund setup" })
    );

    expect(mockPush).toHaveBeenCalledWith("/onboarding/fund-setup");
  });

  it("removes suggestion from list when accepted", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ suggestions: mockSuggestions, count: 2 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      // 5) Accept suggestion response
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    await user.click(acceptButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });

    expect(screen.getByText("ACME Corp")).toBeDefined();
  });

  it("removes suggestion from list when dismissed", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            suggestions: [mockSuggestions[0]],
            count: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      // 5) Dismiss suggestion response
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });

    // Should show "all handled" state
    expect(screen.getByText("All suggestions handled!")).toBeDefined();
  });

  it("shows skip link to fund setup during suggestions step", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchUploadResponse()), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ suggestions: mockSuggestions, count: 2 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("statement.csv", "data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const skipLink = screen.getByRole("link", {
      name: /Skip remaining suggestions/,
    });
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("/onboarding/fund-setup");
  });

  it("sends all files in a single batch upload", async () => {
    const user = userEvent.setup();

    const multiFileResponse = makeBatchUploadResponse({
      fileCount: 2,
      files: [
        {
          id: "file_1", position: 0, fileName: "statement1.csv", format: "csv",
          status: "pending", transactionsFound: 0, transactionsImported: 0,
          duplicatesSkipped: 0, duplicatesFlagged: 0, flaggedData: null,
          importLogId: null, errorMessage: null,
        },
        {
          id: "file_2", position: 1, fileName: "statement2.csv", format: "csv",
          status: "pending", transactionsFound: 0, transactionsImported: 0,
          duplicatesSkipped: 0, duplicatesFlagged: 0, flaggedData: null,
          importLogId: null, errorMessage: null,
        },
      ],
    });

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Batch upload POST
      .mockResolvedValueOnce(
        new Response(JSON.stringify(multiFileResponse), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3) Poll returns completed
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeBatchCompletedResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 4) Fetch suggestions
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ suggestions: mockSuggestions, count: 2 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file1 = createMockFile("statement1.csv", "data1");
    const file2 = createMockFile("statement2.csv", "data2");
    await user.upload(input, [file1, file2]);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // calls[0] is the mount check, calls[1] is the batch upload
    const uploadCall = vi.mocked(global.fetch).mock.calls[1];
    expect(uploadCall[0]).toBe("/api/import/batch");
  });

  it("shows error when upload fails", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      // 1) Mount: check for active batch
      .mockResolvedValueOnce(noActiveBatchResponse())
      // 2) Upload POST fails
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "unsupported file format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<OnboardingUploadPage />);

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("test.csv", "bad,data");
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "unsupported file format"
      );
    });
  });
});
