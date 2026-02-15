import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockSummary = {
  fileName: "statement.csv",
  format: "csv",
  transactionsFound: 10,
  transactionsImported: 7,
  duplicatesSkipped: 2,
  duplicatesFlagged: 1,
  flagged: [
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
};

const mockSummaryNoFlagged = {
  fileName: "statement.ofx",
  format: "ofx",
  transactionsFound: 5,
  transactionsImported: 5,
  duplicatesSkipped: 0,
  duplicatesFlagged: 0,
  flagged: [],
  importLogId: "import-2",
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

    expect(screen.getByText("Uploading and processing...")).toBeDefined();
  });

  it("displays import summary after successful upload", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSummaryNoFlagged), {
        status: 201,
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
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSummary), {
        status: 201,
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
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSummary), {
        status: 201,
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

  it("resolves flagged transactions when resolve button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSummary), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
      ) // pattern detect (fire-and-forget)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ resolved: 1, kept: 1, skipped: 0 }), {
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

    await user.click(screen.getByRole("button", { name: "Keep" }));
    await user.click(
      screen.getByRole("button", { name: "Resolve flagged transactions" })
    );

    await waitFor(() => {
      expect(screen.queryByText("Review flagged transactions")).toBeNull();
    });

    // Verify resolve API was called (upload + pattern detect + resolve = 3)
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const resolveCall = vi.mocked(global.fetch).mock.calls[2];
    expect(resolveCall[0]).toBe("/api/import/resolve");
  });

  it("calls /api/patterns/detect after successful upload", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSummaryNoFlagged), {
        status: 201,
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

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const detectCall = vi.mocked(global.fetch).mock.calls[1];
    expect(detectCall[0]).toBe("/api/patterns/detect");
    expect(detectCall[1]).toEqual({ method: "POST" });
  });

  it("does not call /api/patterns/detect when upload fails", async () => {
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
      expect(screen.getByRole("alert")).toBeDefined();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe("/api/import/upload");
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
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSummaryNoFlagged), {
        status: 201,
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

  it("shows error when resolve fails", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSummary), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
      ) // pattern detect (fire-and-forget)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "internal server error" }), {
          status: 500,
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

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.click(
      screen.getByRole("button", { name: "Resolve flagged transactions" })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "internal server error"
      );
    });
  });
});
