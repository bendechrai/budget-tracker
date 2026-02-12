import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import ImportHistoryPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockImportLogs = [
  {
    id: "log-1",
    fileName: "january-statement.csv",
    format: "csv",
    transactionsFound: 25,
    transactionsImported: 20,
    duplicatesSkipped: 3,
    duplicatesFlagged: 2,
    importedAt: "2026-02-01T10:30:00.000Z",
  },
  {
    id: "log-2",
    fileName: "december-statement.ofx",
    format: "ofx",
    transactionsFound: 15,
    transactionsImported: 15,
    duplicatesSkipped: 0,
    duplicatesFlagged: 0,
    importedAt: "2026-01-15T14:00:00.000Z",
  },
];

describe("ImportHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<ImportHistoryPage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the page title", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<ImportHistoryPage />);

    expect(
      screen.getByRole("heading", { name: "Import History" })
    ).toBeDefined();
  });

  it("renders a link back to upload page", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<ImportHistoryPage />);

    const link = screen.getByText("Upload statements");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/import");
  });

  it("renders the list of import logs", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ importLogs: mockImportLogs }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ImportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("january-statement.csv")).toBeDefined();
    });

    expect(screen.getByText("december-statement.ofx")).toBeDefined();
    expect(screen.getByText("CSV")).toBeDefined();
    expect(screen.getByText("OFX")).toBeDefined();
  });

  it("shows counts for each import log", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ importLogs: mockImportLogs }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ImportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("january-statement.csv")).toBeDefined();
    });

    // Check found/imported/skipped labels exist
    const foundLabels = screen.getAllByText("Found");
    expect(foundLabels.length).toBe(2);

    const importedLabels = screen.getAllByText("Imported");
    expect(importedLabels.length).toBe(2);

    const skippedLabels = screen.getAllByText("Skipped");
    expect(skippedLabels.length).toBe(2);

    // First log has flagged items, second does not
    const flaggedLabels = screen.getAllByText("Flagged");
    expect(flaggedLabels.length).toBe(1);
  });

  it("shows empty state when there are no imports", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ importLogs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ImportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("No imports yet")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Upload a bank statement to see your import history here."
      )
    ).toBeDefined();
  });

  it("shows an error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ImportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load import history"
      );
    });
  });

  it("calls the correct API endpoint", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<ImportHistoryPage />);

    expect(global.fetch).toHaveBeenCalledWith("/api/import/history");
  });
});
