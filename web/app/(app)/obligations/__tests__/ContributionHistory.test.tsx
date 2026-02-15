import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import ContributionHistory from "../ContributionHistory";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockContributions = [
  {
    id: "cr_2",
    obligationId: "obl_1",
    amount: 200,
    date: "2025-06-10T00:00:00.000Z",
    type: "contribution",
    note: null,
    createdAt: "2025-06-10T00:00:00.000Z",
  },
  {
    id: "cr_1",
    obligationId: "obl_1",
    amount: -50,
    date: "2025-06-01T00:00:00.000Z",
    type: "manual_adjustment",
    note: "Correction",
    createdAt: "2025-06-01T00:00:00.000Z",
  },
];

describe("ContributionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders contribution history list", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContributions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history-list")).toBeDefined();
    });

    expect(screen.getByTestId("contribution-item-cr_2")).toBeDefined();
    expect(screen.getByTestId("contribution-item-cr_1")).toBeDefined();
  });

  it("shows positive amount with + prefix", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContributions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-amount-cr_2").textContent).toBe("+$200.00");
    });
  });

  it("shows negative amount without + prefix", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContributions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-amount-cr_1").textContent).toBe("-$50.00");
    });
  });

  it("shows type badges", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContributions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history-list")).toBeDefined();
    });

    const items = screen.getByTestId("contribution-history-list");
    expect(items.textContent).toContain("Contribution");
    expect(items.textContent).toContain("Adjustment");
  });

  it("shows note when present", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContributions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history-list")).toBeDefined();
    });

    expect(screen.getByTestId("contribution-history-list").textContent).toContain("Correction");
  });

  it("shows empty state when no contributions", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history-empty")).toBeDefined();
    });

    expect(screen.getByTestId("contribution-history-empty").textContent).toBe(
      "No contributions recorded yet."
    );
  });

  it("shows error on API failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_1" />);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history-error")).toBeDefined();
    });

    expect(screen.getByTestId("contribution-history-error").textContent).toBe(
      "Failed to load contribution history"
    );
  });

  it("fetches contributions for the correct obligation", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionHistory obligationId="obl_42" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/contributions/obl_42");
    });
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));

    render(<ContributionHistory obligationId="obl_1" />);

    expect(screen.getByTestId("contribution-history-loading")).toBeDefined();
  });
});
