import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ObligationsPage from "../page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockObligations = [
  {
    id: "1",
    name: "Netflix",
    type: "recurring",
    amount: 22.99,
    frequency: "monthly",
    frequencyDays: null,
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: null,
    nextDueDate: "2026-03-15T00:00:00.000Z",
    isPaused: false,
    isArchived: false,
    fundGroupId: null,
    fundGroup: null,
    customEntries: [],
  },
  {
    id: "2",
    name: "Tax Repayment",
    type: "recurring_with_end",
    amount: 200,
    frequency: "monthly",
    frequencyDays: null,
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2027-10-01T00:00:00.000Z",
    nextDueDate: "2026-02-01T00:00:00.000Z",
    isPaused: false,
    isArchived: false,
    fundGroupId: "g1",
    fundGroup: { id: "g1", name: "Bills" },
    customEntries: [],
  },
  {
    id: "3",
    name: "Car Rego",
    type: "one_off",
    amount: 850,
    frequency: null,
    frequencyDays: null,
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: null,
    nextDueDate: "2026-07-01T00:00:00.000Z",
    isPaused: true,
    isArchived: false,
    fundGroupId: null,
    fundGroup: null,
    customEntries: [],
  },
];

// A past-due obligation (due date in the past)
const pastDueObligation = {
  id: "4",
  name: "Overdue Bill",
  type: "recurring" as const,
  amount: 50,
  frequency: "monthly",
  frequencyDays: null,
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: null,
  nextDueDate: "2025-01-15T00:00:00.000Z",
  isPaused: false,
  isArchived: false,
  fundGroupId: null,
  fundGroup: null,
  customEntries: [],
};

describe("ObligationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.confirm = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<ObligationsPage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the list of obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Tax Repayment")).toBeDefined();
    expect(screen.getByText("Car Rego")).toBeDefined();
    expect(screen.getByText(/\$22\.99/)).toBeDefined();
    expect(screen.getByText(/\$200\.00/)).toBeDefined();
    expect(screen.getByText(/\$850\.00/)).toBeDefined();
  });

  it("shows the empty state when there are no obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("No obligations yet")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Add your first obligation to start tracking your expenses and building your sinking fund."
      )
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add your first obligation" })
    ).toBeDefined();
  });

  it("groups obligations by fund group", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // With multiple groups, group titles should be shown
    expect(screen.getByText("Ungrouped")).toBeDefined();
    expect(screen.getByText("Bills")).toBeDefined();
  });

  it("does not show group titles when all in one group", async () => {
    const singleGroupObligations = [mockObligations[0], mockObligations[2]];
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(singleGroupObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.queryByText("Ungrouped")).toBeNull();
  });

  it("shows type badges for each obligation", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Recurring")).toBeDefined();
    expect(screen.getByText("Recurring (ends)")).toBeDefined();
    expect(screen.getByText("One-off")).toBeDefined();
  });

  it("shows paused badge for paused obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeDefined();
    });
  });

  it("highlights past-due obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([pastDueObligation]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Overdue Bill")).toBeDefined();
    });

    expect(screen.getByText("Past due")).toBeDefined();
  });

  it("does not show past-due badge for paused obligations", async () => {
    const pausedPastDue = { ...pastDueObligation, id: "5", isPaused: true };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([pausedPastDue]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Overdue Bill")).toBeDefined();
    });

    expect(screen.queryByText("Past due")).toBeNull();
    expect(screen.getByText("Paused")).toBeDefined();
  });

  it("shows end date for recurring_with_end obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([mockObligations[1]]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Tax Repayment")).toBeDefined();
    });

    expect(screen.getByText(/Ends:/)).toBeDefined();
  });

  it("navigates to the new obligation page when the add button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Add obligation" })
    );

    expect(mockPush).toHaveBeenCalledWith("/obligations/new");
  });

  it("navigates to the new obligation page from the empty state", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("No obligations yet")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Add your first obligation" })
    );

    expect(mockPush).toHaveBeenCalledWith("/obligations/new");
  });

  it("navigates to the edit page when edit is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);

    expect(mockPush).toHaveBeenCalledWith("/obligations/edit/1");
  });

  it("deletes an obligation after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockObligations), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Delete Netflix" })
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete "Netflix"?'
    );

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });

    expect(screen.getByText("Tax Repayment")).toBeDefined();
  });

  it("does not delete when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Delete Netflix" })
    );

    expect(screen.getByText("Netflix")).toBeDefined();
  });

  it("shows an error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load obligations"
      );
    });
  });

  it("shows the page title", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    expect(
      screen.getByRole("heading", { name: "Obligations" })
    ).toBeDefined();
  });

  it("shows the archive section when obligations exist", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockObligations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Archived")).toBeDefined();
    expect(
      screen.getByText(
        "No archived obligations. Completed obligations will appear here."
      )
    ).toBeDefined();
  });

  it("shows frequency for recurring obligations", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([mockObligations[0]]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Monthly/)).toBeDefined();
    });
  });

  it("shows custom frequency with days", async () => {
    const customFreqObligation = {
      ...mockObligations[0],
      id: "5",
      frequency: "custom",
      frequencyDays: 14,
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([customFreqObligation]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Every 14 days/)).toBeDefined();
    });
  });
});
