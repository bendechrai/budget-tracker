import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import UpcomingObligations from "../UpcomingObligations";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function futureDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

const mockObligations = [
  {
    id: "ob1",
    name: "Rent",
    amount: 2000,
    nextDueDate: futureDate(5),
    isPaused: false,
    fundBalance: { currentBalance: 2000 },
  },
  {
    id: "ob2",
    name: "Netflix",
    amount: 22.99,
    nextDueDate: futureDate(10),
    isPaused: false,
    fundBalance: { currentBalance: 10 },
  },
  {
    id: "ob3",
    name: "Gym",
    amount: 60,
    nextDueDate: futureDate(10),
    isPaused: false,
    fundBalance: null,
  },
  {
    id: "ob4",
    name: "Car Insurance",
    amount: 1200,
    nextDueDate: futureDate(45),
    isPaused: false,
    fundBalance: { currentBalance: 600 },
  },
  {
    id: "ob5",
    name: "Paused Bill",
    amount: 50,
    nextDueDate: futureDate(3),
    isPaused: true,
    fundBalance: null,
  },
];

describe("UpcomingObligations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders sorted list of upcoming obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getByText("Rent")).toBeDefined();
    });

    expect(screen.getByText("Netflix")).toBeDefined();
    expect(screen.getByText("Gym")).toBeDefined();
    // Car Insurance is 45 days out - beyond 30 day window
    expect(screen.queryByText("Car Insurance")).toBeNull();
    // Paused Bill should be excluded
    expect(screen.queryByText("Paused Bill")).toBeNull();
  });

  it("groups same-day obligations together", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Netflix and Gym are on the same day (10 days from now)
    // They should appear under the same date group
    const dateLabels = screen.getAllByRole("heading", { level: 3 });
    // One group for Rent (5 days), one group for Netflix+Gym (10 days)
    expect(dateLabels.length).toBe(2);
  });

  it("shows fund status for each obligation", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getByText("Fully funded")).toBeDefined();
    });

    expect(screen.getByText("Partially funded")).toBeDefined();
    expect(screen.getByText("Unfunded")).toBeDefined();
  });

  it("shows amounts for obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getByText("$2000.00")).toBeDefined();
    });

    expect(screen.getByText("$22.99")).toBeDefined();
    expect(screen.getByText("$60.00")).toBeDefined();
  });

  it("shows empty state when no obligations due in next 30 days", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse([]));

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(
        screen.getByText("No obligations due in the next 30 days.")
      ).toBeDefined();
    });
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ error: "internal server error" }, 500)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load upcoming obligations"
      );
    });
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    render(<UpcomingObligations />);
    expect(screen.getByText("Loading upcoming...")).toBeDefined();
  });

  it("renders the section heading", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse([]));

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Upcoming obligations" })
      ).toBeDefined();
    });
  });
});
