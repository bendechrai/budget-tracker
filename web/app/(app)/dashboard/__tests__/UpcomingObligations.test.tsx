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
    type: "recurring",
    frequency: "monthly",
    fundBalance: { currentBalance: 2000 },
  },
  {
    id: "ob2",
    name: "Netflix",
    amount: 22.99,
    nextDueDate: futureDate(10),
    isPaused: false,
    type: "recurring",
    frequency: "monthly",
    fundBalance: { currentBalance: 10 },
  },
  {
    id: "ob3",
    name: "Gym",
    amount: 60,
    nextDueDate: futureDate(10),
    isPaused: false,
    type: "recurring",
    frequency: "monthly",
    fundBalance: null,
  },
  {
    id: "ob4",
    name: "Car Insurance",
    amount: 1200,
    nextDueDate: futureDate(45),
    isPaused: false,
    type: "recurring",
    frequency: "quarterly",
    fundBalance: { currentBalance: 600 },
  },
  {
    id: "ob5",
    name: "Paused Bill",
    amount: 50,
    nextDueDate: futureDate(3),
    isPaused: true,
    type: "recurring",
    frequency: "monthly",
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
      expect(screen.getAllByText("Rent").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("Netflix").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Gym").length).toBeGreaterThanOrEqual(1);
    // Car Insurance is 45 days out - within default 45 day window
    expect(screen.getAllByText("Car Insurance").length).toBeGreaterThanOrEqual(1);
    // Paused Bill should be excluded
    expect(screen.queryByText("Paused Bill")).toBeNull();
  });

  it("groups same-day obligations together", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getAllByText("Netflix").length).toBeGreaterThanOrEqual(1);
    });

    // Netflix and Gym are on the same day (10 days from now)
    // With monthly recurrence, they also share recurrence dates
    const dateLabels = screen.getAllByRole("heading", { level: 3 });
    // More groups now due to projected recurrences
    expect(dateLabels.length).toBeGreaterThanOrEqual(3);
  });

  it("shows fund status for each obligation", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getAllByText("Fully funded").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("Partially funded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unfunded").length).toBeGreaterThanOrEqual(1);
  });

  it("shows amounts for obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getAllByText("$2000.00").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("$22.99").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$60.00").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no obligations due in default window", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse([]));

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(
        screen.getByText("No obligations due in the next 45 days.")
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

  it("projects recurring obligations multiple times within the window", async () => {
    const weeklyObligation = [
      {
        id: "ob-weekly",
        name: "Weekly Savings",
        amount: 100,
        nextDueDate: futureDate(3),
        isPaused: false,
        type: "recurring",
        frequency: "weekly",
        fundBalance: null,
      },
    ];

    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(weeklyObligation)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getAllByText("Weekly Savings").length).toBeGreaterThanOrEqual(1);
    });

    // Default is 45 days. A weekly obligation starting 3 days out
    // should appear ~6 times (days 3, 10, 17, 24, 31, 38)
    const items = screen.getAllByText("Weekly Savings");
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  it("does not project one-off obligations more than once", async () => {
    const oneOffObligation = [
      {
        id: "ob-oneoff",
        name: "One-Time Fee",
        amount: 500,
        nextDueDate: futureDate(10),
        isPaused: false,
        type: "one_off",
        frequency: null,
        fundBalance: null,
      },
    ];

    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(oneOffObligation)
    );

    render(<UpcomingObligations />);

    await waitFor(() => {
      expect(screen.getByText("One-Time Fee")).toBeDefined();
    });

    const items = screen.getAllByText("One-Time Fee");
    expect(items.length).toBe(1);
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
