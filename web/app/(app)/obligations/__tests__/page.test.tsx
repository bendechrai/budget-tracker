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

const mockOverrideAmount = vi.fn();
const mockClearAmountOverride = vi.fn();
const mockAddHypothetical = vi.fn();
const mockRemoveHypothetical = vi.fn();
const mockResetAll = vi.fn();

const defaultOverrides = {
  toggledOffIds: new Set<string>(),
  amountOverrides: new Map<string, number>(),
  hypotheticals: [] as Array<{
    id: string;
    name: string;
    type: string;
    amount: number;
    intervalUnit: string | null;
    intervalCount: number;
    nextDueDate: Date;
    endDate: Date | null;
    fundGroupId: string | null;
  }>,
};

let currentOverrides = { ...defaultOverrides };

vi.mock("@/app/contexts/WhatIfContext", () => ({
  useWhatIf: () => ({
    overrides: currentOverrides,
    isActive: currentOverrides.toggledOffIds.size > 0 || currentOverrides.amountOverrides.size > 0 || currentOverrides.hypotheticals.length > 0,
    overrideAmount: mockOverrideAmount,
    clearAmountOverride: mockClearAmountOverride,
    addHypothetical: mockAddHypothetical,
    removeHypothetical: mockRemoveHypothetical,
    resetAll: mockResetAll,
    changeSummary: "",
  }),
}));

const mockObligations = [
  {
    id: "1",
    name: "Netflix",
    type: "recurring",
    amount: 22.99,
    intervalUnit: "month",
    intervalCount: 1,
    endDate: null,
    nextDueDate: "2026-03-15T00:00:00.000Z",
    isPaused: false,
    isArchived: false,
    fundGroupId: "g0",
    fundGroup: { id: "g0", name: "Ungrouped" },
    customEntries: [],
  },
  {
    id: "2",
    name: "Tax Repayment",
    type: "recurring_with_end",
    amount: 200,
    intervalUnit: "month",
    intervalCount: 1,
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
    intervalUnit: null,
    intervalCount: 1,
    endDate: null,
    nextDueDate: "2026-07-01T00:00:00.000Z",
    isPaused: true,
    isArchived: false,
    fundGroupId: "g0",
    fundGroup: { id: "g0", name: "Ungrouped" },
    customEntries: [],
  },
];

// A past-due obligation (due date in the past)
const pastDueObligation = {
  id: "4",
  name: "Overdue Bill",
  type: "recurring" as const,
  amount: 50,
  intervalUnit: "month",
  intervalCount: 1,
  endDate: null,
  nextDueDate: "2025-01-15T00:00:00.000Z",
  isPaused: false,
  isArchived: false,
  fundGroupId: "g0",
  fundGroup: { id: "g0", name: "Ungrouped" },
  customEntries: [],
};

const mockEscalations: Record<string, unknown[]> = {};

const mockFundGroups = [
  { id: "g0", name: "Ungrouped" },
  { id: "g1", name: "Bills" },
];

function mockFetchResponses(active: unknown[], archived: unknown[] = []) {
  vi.mocked(global.fetch).mockImplementation((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("archived=true")) {
      return Promise.resolve(
        new Response(JSON.stringify(archived), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    if (url === "/api/fund-groups") {
      return Promise.resolve(
        new Response(JSON.stringify(mockFundGroups), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    if (url.includes("/api/escalations") && (!init || init.method !== "DELETE")) {
      const obIdMatch = url.match(/obligationId=([^&]+)/);
      const obId = obIdMatch ? obIdMatch[1] : "";
      return Promise.resolve(
        new Response(JSON.stringify(mockEscalations[obId] ?? []), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    if (url.includes("/api/escalations/") && init?.method === "DELETE") {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(active), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
}

describe("ObligationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Clear mockEscalations
    for (const key of Object.keys(mockEscalations)) {
      delete mockEscalations[key];
    }
    currentOverrides = {
      toggledOffIds: new Set<string>(),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    render(<ObligationsPage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the list of obligations", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Tax Repayment")).toBeDefined();
    expect(screen.getByText("Car Rego")).toBeDefined();
    expect(screen.getAllByText(/\$22\.99/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$200\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$850\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state when there are no obligations", async () => {
    mockFetchResponses([], []);

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
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // With multiple groups, group titles should be shown
    expect(screen.getByRole("heading", { name: "Ungrouped" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Bills" })).toBeDefined();
  });

  it("does not show group titles when all in one group", async () => {
    const singleGroupObligations = [mockObligations[0], mockObligations[2]];
    mockFetchResponses(singleGroupObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.queryByRole("heading", { name: "Ungrouped" })).toBeNull();
  });

  it("shows type badges for each obligation", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Recurring")).toBeDefined();
    expect(screen.getByText("Recurring (ends)")).toBeDefined();
    expect(screen.getByText("One-off")).toBeDefined();
  });

  it("shows paused badge for paused obligations", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeDefined();
    });
  });

  it("highlights past-due obligations", async () => {
    mockFetchResponses([pastDueObligation]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Overdue Bill")).toBeDefined();
    });

    expect(screen.getByText("Past due")).toBeDefined();
  });

  it("does not show past-due badge for paused obligations", async () => {
    const pausedPastDue = { ...pastDueObligation, id: "5", isPaused: true };
    mockFetchResponses([pausedPastDue]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Overdue Bill")).toBeDefined();
    });

    expect(screen.queryByText("Past due")).toBeNull();
    expect(screen.getByText("Paused")).toBeDefined();
  });

  it("shows end date for recurring_with_end obligations", async () => {
    mockFetchResponses([mockObligations[1]]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Tax Repayment")).toBeDefined();
    });

    expect(screen.getByText(/Ends:/)).toBeDefined();
  });

  it("navigates to the new obligation page when the add button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

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
    mockFetchResponses([], []);

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
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const editButton = screen.getByRole("button", { name: "Edit Netflix" });
    await user.click(editButton);

    expect(mockPush).toHaveBeenCalledWith("/obligations/edit/1");
  });

  it("deletes an obligation after confirmation", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Set up delete response
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await user.click(
      screen.getByRole("button", { name: "Delete Netflix" })
    );

    // ConfirmDialog should appear
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByTestId("confirm-dialog-message").textContent).toBe(
      'Are you sure you want to delete "Netflix"?'
    );

    await user.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });

    expect(screen.getByText("Tax Repayment")).toBeDefined();
  });

  it("does not delete when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Delete Netflix" })
    );

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    await user.click(screen.getByTestId("confirm-dialog-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });

    expect(screen.getByText("Netflix")).toBeDefined();
  });

  it("shows an error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
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
    mockFetchResponses([], []);

    render(<ObligationsPage />);

    expect(
      screen.getByRole("heading", { name: "Obligations" })
    ).toBeDefined();
  });

  it("shows the archive section when obligations exist", async () => {
    mockFetchResponses(mockObligations);

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

  it("renders sparkle buttons on each obligation", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByTestId("sparkle-button-1")).toBeDefined();
    expect(screen.getByTestId("sparkle-button-2")).toBeDefined();
    expect(screen.getByTestId("sparkle-button-3")).toBeDefined();
  });

  it("shows frequency for recurring obligations", async () => {
    mockFetchResponses([mockObligations[0]]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Monthly/)).toBeDefined();
    });
  });

  it("shows custom frequency with days", async () => {
    const customFreqObligation = {
      ...mockObligations[0],
      id: "5",
      intervalUnit: "day",
      intervalCount: 14,
    };

    mockFetchResponses([customFreqObligation]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Every 14 days/)).toBeDefined();
    });
  });

  // New tests for pause/resume toggle

  it("toggles pause state when pause button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Netflix is not paused, so the button should have "Pause Netflix" aria-label
    const pauseButton = screen.getByRole("button", { name: "Pause Netflix" });

    // Mock the PUT response
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await user.click(pauseButton);

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "/api/obligations/1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ isPaused: true }),
        })
      );
    });
  });

  it("toggles resume state when resume button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Car Rego")).toBeDefined();
    });

    // Car Rego is paused, so the button should have "Resume Car Rego" aria-label
    const resumeButton = screen.getByRole("button", { name: "Resume Car Rego" });

    // Mock the PUT response
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await user.click(resumeButton);

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "/api/obligations/3",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ isPaused: false }),
        })
      );
    });
  });

  // New tests for archive display

  it("displays archived obligations in the archive section", async () => {
    const archivedOb = {
      id: "10",
      name: "Old Subscription",
      type: "recurring",
      amount: 9.99,
      intervalUnit: "month",
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2025-06-01T00:00:00.000Z",
      isPaused: false,
      isArchived: true,
      fundGroupId: "g0",
      fundGroup: { id: "g0", name: "Ungrouped" },
      customEntries: [],
    };

    mockFetchResponses(mockObligations, [archivedOb]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Old Subscription")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Archived" })).toBeDefined();
  });

  it("auto-archives a completed one-off obligation", async () => {
    const completedOneOff = {
      id: "20",
      name: "Past One-Off",
      type: "one_off",
      amount: 100,
      intervalUnit: null,
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2024-06-01T00:00:00.000Z",
      isPaused: false,
      isArchived: false,
      fundGroupId: "g0",
      fundGroup: { id: "g0", name: "Ungrouped" },
      customEntries: [],
    };

    // The auto-archive sends a PUT for the completed obligation
    let putCalled = false;
    vi.mocked(global.fetch).mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("archived=true")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url === "/api/fund-groups") {
        return Promise.resolve(
          new Response(JSON.stringify(mockFundGroups), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url.includes("/api/obligations/20") && !putCalled) {
        putCalled = true;
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([completedOneOff]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    render(<ObligationsPage />);

    await waitFor(() => {
      // Completed one-off should be moved to archive section
      expect(screen.getByText("Past One-Off")).toBeDefined();
    });

    // Verify the PUT was called to archive it
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/obligations/20",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ isArchived: true }),
      })
    );
  });

  it("auto-archives a completed recurring_with_end obligation", async () => {
    const completedRecurring = {
      id: "21",
      name: "Finished Plan",
      type: "recurring_with_end",
      amount: 200,
      intervalUnit: "month",
      intervalCount: 1,
      endDate: "2024-12-01T00:00:00.000Z",
      nextDueDate: "2024-12-01T00:00:00.000Z",
      isPaused: false,
      isArchived: false,
      fundGroupId: "g0",
      fundGroup: { id: "g0", name: "Ungrouped" },
      customEntries: [],
    };

    vi.mocked(global.fetch).mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("archived=true")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url === "/api/fund-groups") {
        return Promise.resolve(
          new Response(JSON.stringify(mockFundGroups), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url.includes("/api/obligations/21")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([completedRecurring]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Finished Plan")).toBeDefined();
    });

    // Should be in archive, not in active list
    expect(screen.getByRole("heading", { name: "Archived" })).toBeDefined();
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/obligations/21",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ isArchived: true }),
      })
    );
  });

  it("does not auto-archive paused completed obligations", async () => {
    const pausedCompleted = {
      id: "22",
      name: "Paused One-Off",
      type: "one_off",
      amount: 100,
      intervalUnit: null,
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2024-06-01T00:00:00.000Z",
      isPaused: true,
      isArchived: false,
      fundGroupId: "g0",
      fundGroup: { id: "g0", name: "Ungrouped" },
      customEntries: [],
    };

    mockFetchResponses([pausedCompleted]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Paused One-Off")).toBeDefined();
    });

    // Should remain in active list since it's paused
    expect(screen.getByText("Paused")).toBeDefined();
  });

  it("shows archive section with only archived obligations (no active)", async () => {
    const archivedOb = {
      id: "30",
      name: "Archived Only",
      type: "recurring",
      amount: 15.0,
      intervalUnit: "month",
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2025-06-01T00:00:00.000Z",
      isPaused: false,
      isArchived: true,
      fundGroupId: "g0",
      fundGroup: { id: "g0", name: "Ungrouped" },
      customEntries: [],
    };

    mockFetchResponses([], [archivedOb]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Archived Only")).toBeDefined();
    });

    expect(screen.getByRole("heading", { name: "Archived" })).toBeDefined();
    // Should not show empty state since there are archived obligations
    expect(screen.queryByText("No obligations yet")).toBeNull();
  });

  // Amount override tests

  it("renders amount override input for each obligation", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByTestId("amount-override-1")).toBeDefined();
    expect(screen.getByTestId("amount-override-2")).toBeDefined();
    expect(screen.getByTestId("amount-override-3")).toBeDefined();
  });

  it("calls overrideAmount when amount override input changes", async () => {
    mockFetchResponses([mockObligations[0]]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const input = screen.getByTestId("amount-override-1") as HTMLInputElement;
    // Use fireEvent.change for controlled input with mocked state
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "30" } });

    expect(mockOverrideAmount).toHaveBeenCalledWith("1", 30);
  });

  it("shows what-if amount badge when amount is overridden", async () => {
    currentOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map([["1", 30]]),
      hypotheticals: [],
    };

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("What-if: $30.00")).toBeDefined();
    // The displayed amount in the detail line should reflect the overridden amount
    const allAmounts = screen.getAllByText(/\$30\.00/);
    expect(allAmounts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows reset button when amount override exists", async () => {
    currentOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map([["1", 30]]),
      hypotheticals: [],
    };

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByTestId("amount-reset-1")).toBeDefined();
  });

  it("hides reset button when no amount override exists", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.queryByTestId("amount-reset-1")).toBeNull();
  });

  it("calls clearAmountOverride when reset button is clicked", async () => {
    const user = userEvent.setup();
    currentOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map([["1", 30]]),
      hypotheticals: [],
    };

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByTestId("amount-reset-1"));

    expect(mockClearAmountOverride).toHaveBeenCalledWith("1");
  });

  it("calls clearAmountOverride when input is emptied", async () => {
    currentOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map([["1", 30]]),
      hypotheticals: [],
    };

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const input = screen.getByTestId("amount-override-1") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "" } });

    expect(mockClearAmountOverride).toHaveBeenCalledWith("1");
  });

  it("shows Add hypothetical button when obligations exist", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Add hypothetical obligation" })).toBeDefined();
  });

  it("shows hypothetical form when Add hypothetical is clicked", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Add hypothetical obligation" }));

    expect(screen.getByTestId("hypothetical-form")).toBeDefined();
  });

  it("displays hypothetical obligations from context", async () => {
    currentOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map(),
      hypotheticals: [
        {
          id: "hypo-1",
          name: "Holiday Fund",
          type: "one_off",
          amount: 2000,
          intervalUnit: null,
          intervalCount: 1,
          nextDueDate: new Date("2026-12-01"),
          endDate: null,
          fundGroupId: null,
        },
      ],
    };

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Holiday Fund")).toBeDefined();
    expect(screen.getByText("Hypothetical")).toBeDefined();
    expect(screen.getByText(/\$2,?000\.00/)).toBeDefined();
  });

  it("calls removeHypothetical when remove button is clicked", async () => {
    const user = userEvent.setup();
    currentOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map(),
      hypotheticals: [
        {
          id: "hypo-1",
          name: "Holiday Fund",
          type: "one_off",
          amount: 2000,
          intervalUnit: null,
          intervalCount: 1,
          nextDueDate: new Date("2026-12-01"),
          endDate: null,
          fundGroupId: null,
        },
      ],
    };

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Holiday Fund")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Remove Holiday Fund" }));

    expect(mockRemoveHypothetical).toHaveBeenCalledWith("hypo-1");
  });

  // Escalation display tests

  it("shows escalation section for non-one-off obligations", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Netflix (recurring) and Tax Repayment (recurring_with_end) should have escalation sections
    expect(screen.getByTestId("escalation-section-1")).toBeDefined();
    expect(screen.getByTestId("escalation-section-2")).toBeDefined();
  });

  it("hides escalation section for one-off obligations", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Car Rego")).toBeDefined();
    });

    // Car Rego is one-off, should not have escalation section
    expect(screen.queryByTestId("escalation-section-3")).toBeNull();
  });

  it("expands escalation section and shows rules on toggle click", async () => {
    const user = userEvent.setup();
    mockEscalations["1"] = [
      {
        id: "esc-1",
        obligationId: "1",
        changeType: "percentage",
        value: 3,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: 12,
        isApplied: false,
        appliedAt: null,
      },
    ];

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Click to expand escalation section for Netflix
    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      expect(screen.getByTestId("escalation-rule-esc-1")).toBeDefined();
    });

    expect(screen.getByText("+3%")).toBeDefined();
    expect(screen.getByText(/Every year/)).toBeDefined();
  });

  it("shows applied badge for applied escalation rules", async () => {
    const user = userEvent.setup();
    mockEscalations["1"] = [
      {
        id: "esc-applied",
        obligationId: "1",
        changeType: "absolute",
        value: 25.99,
        effectiveDate: "2026-01-01T00:00:00.000Z",
        intervalMonths: null,
        isApplied: true,
        appliedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      expect(screen.getByText("Applied")).toBeDefined();
    });
  });

  it("calls delete API when remove button is clicked on an escalation rule", async () => {
    const user = userEvent.setup();
    mockEscalations["1"] = [
      {
        id: "esc-del",
        obligationId: "1",
        changeType: "fixed_increase",
        value: 5,
        effectiveDate: "2026-06-01T00:00:00.000Z",
        intervalMonths: null,
        isApplied: false,
        appliedAt: null,
      },
    ];

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      expect(screen.getByTestId("escalation-rule-esc-del")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Delete escalation rule esc-del" }));

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "/api/escalations/esc-del",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("shows escalation count badge when rules exist", async () => {
    const user = userEvent.setup();
    mockEscalations["1"] = [
      {
        id: "esc-count-1",
        obligationId: "1",
        changeType: "percentage",
        value: 5,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: 12,
        isApplied: false,
        appliedAt: null,
      },
      {
        id: "esc-count-2",
        obligationId: "1",
        changeType: "absolute",
        value: 30,
        effectiveDate: "2026-04-01T00:00:00.000Z",
        intervalMonths: null,
        isApplied: false,
        appliedAt: null,
      },
    ];

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Click to expand (which fetches escalations)
    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      // The count badge should show "2"
      expect(screen.getByText("2")).toBeDefined();
    });
  });

  it("shows 'Add price change' button in expanded escalation section", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      expect(screen.getByText("Add price change")).toBeDefined();
    });
  });

  it("shows EscalationForm when 'Add price change' is clicked", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      expect(screen.getByText("Add price change")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Add price change" }));

    expect(screen.getByTestId("escalation-form")).toBeDefined();
  });

  // Fund pill tests

  it("renders fund pills on active obligation cards", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByTestId("fund-pill-1")).toBeDefined();
    expect(screen.getByTestId("fund-pill-2")).toBeDefined();
    expect(screen.getByTestId("fund-pill-3")).toBeDefined();
  });

  it("shows correct fund name on each pill", async () => {
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByTestId("fund-pill-1").textContent).toBe("Ungrouped");
    expect(screen.getByTestId("fund-pill-2").textContent).toBe("Bills");
  });

  it("calls move API with correct fundGroupId when fund is changed", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    // Click the fund pill for Netflix (currently in g0/Ungrouped)
    await user.click(screen.getByTestId("fund-pill-1"));

    // Mock the PUT response for the move
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...mockObligations[0],
          fundGroupId: "g1",
          fundGroup: { id: "g1", name: "Bills" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    // Click "Bills" in the dropdown
    await user.click(screen.getByTestId("fund-option-g1"));

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/obligations/1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ fundGroupId: "g1" }),
      })
    );
  });

  it("shows error state when move fund API fails", async () => {
    const user = userEvent.setup();
    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByTestId("fund-pill-1"));

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "fail" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    await user.click(screen.getByTestId("fund-option-g1"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Failed to move obligation");
    });
  });

  it("renders pill as static with single fund group", async () => {
    const singleGroupObs = [mockObligations[0]];
    // Override fetch to return single fund group
    vi.mocked(global.fetch).mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("archived=true")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url === "/api/fund-groups") {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: "g0", name: "Ungrouped" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url.includes("/api/escalations")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(singleGroupObs), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const pill = screen.getByTestId("fund-pill-1");
    expect(pill.tagName).toBe("SPAN");
  });

  it("does not render fund pills on archived cards", async () => {
    const archivedOb = {
      id: "10",
      name: "Old Subscription",
      type: "recurring",
      amount: 9.99,
      intervalUnit: "month",
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2025-06-01T00:00:00.000Z",
      isPaused: false,
      isArchived: true,
      fundGroupId: "g0",
      fundGroup: { id: "g0", name: "Ungrouped" },
      customEntries: [],
    };

    mockFetchResponses(mockObligations, [archivedOb]);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Old Subscription")).toBeDefined();
    });

    expect(screen.queryByTestId("fund-pill-10")).toBeNull();
  });

  it("formats different escalation change types correctly", async () => {
    const user = userEvent.setup();
    mockEscalations["1"] = [
      {
        id: "esc-abs",
        obligationId: "1",
        changeType: "absolute",
        value: 30,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: null,
        isApplied: false,
        appliedAt: null,
      },
      {
        id: "esc-pct",
        obligationId: "1",
        changeType: "percentage",
        value: 5,
        effectiveDate: "2026-08-01T00:00:00.000Z",
        intervalMonths: null,
        isApplied: false,
        appliedAt: null,
      },
      {
        id: "esc-fix",
        obligationId: "1",
        changeType: "fixed_increase",
        value: 3.5,
        effectiveDate: "2026-09-01T00:00:00.000Z",
        intervalMonths: null,
        isApplied: false,
        appliedAt: null,
      },
    ];

    mockFetchResponses(mockObligations);

    render(<ObligationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Toggle escalation rules for Netflix" }));

    await waitFor(() => {
      expect(screen.getByText("Set to $30.00")).toBeDefined();
      expect(screen.getByText("+5%")).toBeDefined();
      expect(screen.getByText("+$3.50")).toBeDefined();
    });
  });

});
