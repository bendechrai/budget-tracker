import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import DashboardPage from "../page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockWhatIf = {
  isActive: false,
  changeSummary: "",
  overrides: {
    toggledOffIds: new Set<string>(),
    amountOverrides: new Map<string, number>(),
    hypotheticals: [] as unknown[],
    escalationOverrides: new Map<string, unknown[]>(),
  },
  resetAll: vi.fn(),
  toggleObligation: vi.fn(),
  overrideAmount: vi.fn(),
  addHypothetical: vi.fn(),
  removeHypothetical: vi.fn(),
  addEscalationOverride: vi.fn(),
  removeEscalationOverride: vi.fn(),
};

vi.mock("@/app/contexts/WhatIfContext", () => ({
  useWhatIf: () => mockWhatIf,
}));

// Mock SuggestionsCard to avoid fetch side effects
vi.mock("../SuggestionsCard", () => ({
  default: () => <div data-testid="suggestions-card">Suggestions</div>,
}));

// Mock recharts to avoid SVG rendering issues in tests
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ReferenceDot: () => <div />,
  ReferenceLine: () => <div />,
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockTimelineData = {
  dataPoints: [
    { date: "2025-01-01T00:00:00.000Z", projectedBalance: 1000 },
    { date: "2025-06-01T00:00:00.000Z", projectedBalance: 800 },
  ],
  expenseMarkers: [],
  contributionMarkers: [],
  crunchPoints: [],
  minProjectedBalance: 800,
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-07-01T00:00:00.000Z",
};

const mockTimelineWithNegative = {
  ...mockTimelineData,
  dataPoints: [
    { date: "2025-01-01T00:00:00.000Z", projectedBalance: 500 },
    { date: "2025-03-01T00:00:00.000Z", projectedBalance: -1225 },
    { date: "2025-06-01T00:00:00.000Z", projectedBalance: 200 },
  ],
  minProjectedBalance: -1225,
};

const mockSnapshot = {
  id: "snap1",
  totalRequired: 4100,
  totalFunded: 3200,
  totalContributionPerCycle: 587.5,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 412,
  nextActionDate: "2025-02-14T00:00:00.000Z",
  nextActionDescription: "Set aside $412.00 this fortnight for Housing",
  nextActionObligationId: "ob1",
  nextActionFundGroupId: "fg1",
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockFullyFundedSnapshot = {
  id: "snap2",
  totalRequired: 4100,
  totalFunded: 4100,
  totalContributionPerCycle: 0,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 0,
  nextActionDate: "2025-03-01T00:00:00.000Z",
  nextActionDescription: "You're fully covered!",
  nextActionObligationId: null,
  nextActionFundGroupId: null,
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockEmptySnapshot = {
  id: "snap3",
  totalRequired: 0,
  totalFunded: 0,
  totalContributionPerCycle: 0,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 0,
  nextActionDate: "2025-02-01T00:00:00.000Z",
  nextActionDescription: "Add your first obligation to get started",
  nextActionObligationId: null,
  nextActionFundGroupId: null,
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockObligationWithBalance = {
  id: "ob1",
  name: "Rent",
  type: "recurring",
  amount: 1200,
  intervalUnit: "month",
  intervalCount: 1,
  nextDueDate: "2025-02-14T00:00:00.000Z",
  fundGroupId: "fg1",
  fundGroup: { id: "fg1", name: "Housing", currentBalance: 800 },
};

const mockFundGroups = [
  { id: "fg1", name: "Housing", currentBalance: 800, _count: { obligations: 1 } },
];

const mockScenarioResponse = {
  snapshot: {
    totalRequired: 2100,
    totalFunded: 2100,
    totalContributionPerCycle: 0,
    cyclePeriodLabel: "per fortnight",
    nextActionAmount: 0,
    nextActionDate: "2025-03-01T00:00:00.000Z",
    nextActionDescription: "You're fully covered!",
  },
  timeline: {
    ...mockTimelineData,
    dataPoints: mockTimelineData.dataPoints.map((dp) => ({
      ...dp,
      projectedBalance: dp.projectedBalance + 500,
    })),
  },
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Reset to inactive what-if by default
    mockWhatIf.isActive = false;
    mockWhatIf.changeSummary = "";
    mockWhatIf.overrides = {
      toggledOffIds: new Set<string>(),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
      escalationOverrides: new Map(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the fund status card with total per-cycle contribution", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", fundGroup: { id: "fg1", name: "Housing", currentBalance: 800 }, amount: 1200 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("total-per-cycle")).toBeDefined();
    });

    // Total contribution per cycle is shown prominently
    expect(screen.getByTestId("total-per-cycle").textContent).toBe("$587.50");
    expect(screen.getByText("Total contribution required per fortnight")).toBeDefined();
    expect(screen.getByText("across all obligations")).toBeDefined();

    // Shortfall is shown (1200 required - 800 balance = 400 shortfall)
    expect(screen.getByTestId("shortfall-row")).toBeDefined();
    expect(screen.getByText(/\$400\.00 shortfall across all funds/)).toBeDefined();

    // Fund health bars are inside the fund status card
    expect(screen.getByText("Fund health")).toBeDefined();

    // Suggestions card is rendered
    expect(screen.getByTestId("suggestions-card")).toBeDefined();
  });

  it("renders celebration state when fully funded", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", fundGroup: { id: "fg1", name: "Housing", currentBalance: 1200 }, amount: 1200 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockFullyFundedSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("You're fully covered!")).toBeDefined();
    });

    expect(
      screen.getByText(/All obligations are fully funded/)
    ).toBeDefined();
  });

  it("renders empty state when no obligations exist", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockEmptySnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Welcome to your dashboard")
      ).toBeDefined();
    });

    expect(
      screen.getByText(
        /Add your income sources and obligations/
      )
    ).toBeDefined();

    const incomeLink = screen.getByText("Add income");
    expect(incomeLink).toBeDefined();
    expect(incomeLink.closest("a")?.getAttribute("href")).toBe("/income");

    const obligationsLink = screen.getByText("Add obligations");
    expect(obligationsLink).toBeDefined();
    expect(obligationsLink.closest("a")?.getAttribute("href")).toBe(
      "/obligations"
    );
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(
        mockFetchResponse({ error: "internal server error" }, 500)
      );
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load dashboard data"
      );
    });
  });

  it("renders the page title", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockEmptySnapshot));
    });

    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Dashboard" })
    ).toBeDefined();
  });

  it("renders fund status card with health bars and suggestions card in top row", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", fundGroup: { id: "fg1", name: "Housing", currentBalance: 800 }, amount: 1200 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("total-per-cycle")).toBeDefined();
    });

    // Fund health bars are inside the fund status card
    expect(screen.getByText("Fund health")).toBeDefined();

    // Suggestions card is in the top row
    expect(screen.getByTestId("suggestions-card")).toBeDefined();

    // Timeline and upcoming obligations are in the main content area
    const mainContent = container.querySelector("aside");
    expect(mainContent).toBeDefined();
    expect(mainContent?.parentElement).toBeDefined();
  });

  it("renders all sections in single-column layout for empty state", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockEmptySnapshot));
    });

    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Welcome to your dashboard")
      ).toBeDefined();
    });

    // In empty state, there should be no grid layout sections
    const aside = container.querySelector("aside");
    expect(aside).toBeNull();
  });

  it("shows scenario indicator on hero card when what-if is active", async () => {
    mockWhatIf.isActive = true;
    mockWhatIf.changeSummary = "1 expense toggled off";
    mockWhatIf.overrides = {
      toggledOffIds: new Set(["ob1"]),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
      escalationOverrides: new Map(),
    };

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", amount: 1200 }, { id: "ob2", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg2", amount: 500 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/scenario")) {
        return Promise.resolve(mockFetchResponse(mockScenarioResponse));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("scenario-indicator")).toBeDefined();
    });

    expect(screen.getByTestId("scenario-indicator").textContent).toBe(
      "What-if scenario"
    );
  });

  it("displays scenario snapshot data in hero card when what-if is active", async () => {
    mockWhatIf.isActive = true;
    mockWhatIf.changeSummary = "1 expense toggled off";
    mockWhatIf.overrides = {
      toggledOffIds: new Set(["ob1"]),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
      escalationOverrides: new Map(),
    };

    const scenarioWithNextAction = {
      snapshot: {
        totalRequired: 2100,
        totalFunded: 1000,
        totalContributionPerCycle: 350,
        cyclePeriodLabel: "per fortnight",
        nextActionAmount: 200,
        nextActionDate: "2025-03-15T00:00:00.000Z",
        nextActionDescription: "Set aside $200.00 this fortnight for Insurance",
      },
      timeline: mockTimelineData,
    };

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", amount: 1200 }, { id: "ob2", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg2", amount: 500 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/scenario")) {
        return Promise.resolve(mockFetchResponse(scenarioWithNextAction));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      // Should show scenario total per-cycle, not actual
      expect(screen.getByTestId("total-per-cycle").textContent).toBe("$350.00");
    });
  });

  it("renders 'Confirm fund balances' button when fund groups exist and not fully funded", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([mockObligationWithBalance])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("hero-confirm-balances")).toBeDefined();
    });

    expect(screen.getByTestId("hero-confirm-balances").textContent).toBe("Confirm fund balances");
  });

  it("opens ConfirmBalancesModal when 'Confirm fund balances' is clicked", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([mockObligationWithBalance])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("hero-confirm-balances")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("hero-confirm-balances"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-balances-modal")).toBeDefined();
    });

    // Modal should show the fund group with an editable balance input
    const balanceInput = screen.getByTestId("confirm-balances-input-fg1") as HTMLInputElement;
    expect(balanceInput.value).toBe("800.00");
  });

  it("shows preseed row when timeline has negative balance", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", fundGroup: { id: "fg1", name: "Housing", currentBalance: 800 }, amount: 1200 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineWithNegative));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("preseed-row")).toBeDefined();
    });

    expect(screen.getByText(/Suggested starting balance: \$1225\.00/)).toBeDefined();
  });

  it("does not show preseed row when timeline balance stays positive", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1", type: "recurring", intervalUnit: "month", intervalCount: 1, fundGroupId: "fg1", fundGroup: { id: "fg1", name: "Housing", currentBalance: 800 }, amount: 1200 }])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("total-per-cycle")).toBeDefined();
    });

    expect(screen.queryByTestId("preseed-row")).toBeNull();
  });

  it("does not show 'Confirm fund balances' button when what-if is active", async () => {
    mockWhatIf.isActive = true;
    mockWhatIf.changeSummary = "1 expense toggled off";
    mockWhatIf.overrides = {
      toggledOffIds: new Set(["ob2"]),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
      escalationOverrides: new Map(),
    };

    const scenarioWithNextAction2 = {
      snapshot: {
        totalRequired: 2100,
        totalFunded: 1000,
        totalContributionPerCycle: 350,
        cyclePeriodLabel: "per fortnight",
        nextActionAmount: 200,
        nextActionDate: "2025-03-15T00:00:00.000Z",
        nextActionDescription: "Set aside $200.00 this fortnight for Insurance",
      },
      timeline: mockTimelineData,
    };

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([mockObligationWithBalance])
        );
      }
      if (typeof url === "string" && url.includes("/api/fund-groups")) {
        return Promise.resolve(mockFetchResponse(mockFundGroups));
      }
      if (typeof url === "string" && url.includes("/api/engine/scenario")) {
        return Promise.resolve(mockFetchResponse(scenarioWithNextAction2));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("total-per-cycle")).toBeDefined();
    });

    expect(screen.queryByTestId("hero-confirm-balances")).toBeNull();
  });
});
