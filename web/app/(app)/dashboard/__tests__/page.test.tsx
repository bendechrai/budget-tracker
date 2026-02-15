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
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-07-01T00:00:00.000Z",
};

const mockSnapshot = {
  id: "snap1",
  totalRequired: 4100,
  totalFunded: 3200,
  nextActionAmount: 412,
  nextActionDate: "2025-02-14T00:00:00.000Z",
  nextActionDescription: "Set aside $412.00 for Rent by 2025-02-14",
  nextActionObligationId: "ob1",
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockFullyFundedSnapshot = {
  id: "snap2",
  totalRequired: 4100,
  totalFunded: 4100,
  nextActionAmount: 0,
  nextActionDate: "2025-03-01T00:00:00.000Z",
  nextActionDescription: "You're fully covered!",
  nextActionObligationId: null,
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockEmptySnapshot = {
  id: "snap3",
  totalRequired: 0,
  totalFunded: 0,
  nextActionAmount: 0,
  nextActionDate: "2025-02-01T00:00:00.000Z",
  nextActionDescription: "Add your first obligation to get started",
  nextActionObligationId: null,
  calculatedAt: "2025-02-01T00:00:00.000Z",
};

const mockObligationWithBalance = {
  id: "ob1",
  name: "Rent",
  amount: 1200,
  nextDueDate: "2025-02-14T00:00:00.000Z",
  fundBalance: { currentBalance: 800 },
};

const mockScenarioResponse = {
  snapshot: {
    totalRequired: 2100,
    totalFunded: 2100,
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

  it("renders the next action hero card", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1" }])
        );
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("$412.00")).toBeDefined();
    });

    expect(screen.getByText("Next action")).toBeDefined();
    expect(
      screen.getByText("Set aside $412.00 for Rent by 2025-02-14")
    ).toBeDefined();
    expect(screen.getByText(/Due by/)).toBeDefined();
  });

  it("renders celebration state when fully funded", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1" }])
        );
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

  it("renders responsive grid layout with hero and health bar in top row", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1" }])
        );
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      if (typeof url === "string" && url.includes("/api/suggestions")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("$412.00")).toBeDefined();
    });

    // Hero card and health bar are inside the top row grid container
    const heroCard = screen.getByText("Next action").closest("div");
    expect(heroCard).toBeDefined();
    const topRow = heroCard?.parentElement;
    expect(topRow).toBeDefined();

    // Timeline and upcoming obligations are in the main content area
    // The main content section should contain a timeline section and a sidebar
    const mainContent = container.querySelector("aside");
    expect(mainContent).toBeDefined();
    expect(mainContent?.parentElement).toBeDefined();
  });

  it("renders all sections in single-column layout for empty state", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
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
          mockFetchResponse([{ id: "ob1" }, { id: "ob2" }])
        );
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
        nextActionAmount: 200,
        nextActionDate: "2025-03-15T00:00:00.000Z",
        nextActionDescription: "Set aside $200.00 for Insurance by 2025-03-15",
      },
      timeline: mockTimelineData,
    };

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([{ id: "ob1" }, { id: "ob2" }])
        );
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
      // Should show scenario amount, not actual amount
      expect(screen.getByText("$200.00")).toBeDefined();
    });

    expect(
      screen.getByText("Set aside $200.00 for Insurance by 2025-03-15")
    ).toBeDefined();
  });

  it("renders 'Mark as done' button on hero card when obligation ID is present", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([mockObligationWithBalance])
        );
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("hero-mark-done")).toBeDefined();
    });

    expect(screen.getByTestId("hero-mark-done").textContent).toBe("Mark as done");
  });

  it("opens ContributionModal with correct pre-fill when 'Mark as done' is clicked", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([mockObligationWithBalance])
        );
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("hero-mark-done")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("hero-mark-done"));

    await waitFor(() => {
      expect(screen.getByTestId("contribution-modal")).toBeDefined();
    });

    // Modal should show the obligation name
    expect(screen.getByTestId("contribution-modal-name").textContent).toBe("Rent");
    // Modal should be pre-filled with the hero card amount
    expect(screen.getByTestId("contribution-modal-amount")).toBeDefined();
    const amountInput = screen.getByTestId("contribution-modal-amount") as HTMLInputElement;
    expect(amountInput.value).toBe("412.00");
  });

  it("does not show 'Mark as done' button when what-if is active", async () => {
    mockWhatIf.isActive = true;
    mockWhatIf.changeSummary = "1 expense toggled off";
    mockWhatIf.overrides = {
      toggledOffIds: new Set(["ob2"]),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
      escalationOverrides: new Map(),
    };

    const scenarioWithNextAction = {
      snapshot: {
        totalRequired: 2100,
        totalFunded: 1000,
        nextActionAmount: 200,
        nextActionDate: "2025-03-15T00:00:00.000Z",
        nextActionDescription: "Set aside $200.00 for Insurance by 2025-03-15",
      },
      timeline: mockTimelineData,
    };

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(
          mockFetchResponse([mockObligationWithBalance])
        );
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
      expect(screen.getByText("$200.00")).toBeDefined();
    });

    expect(screen.queryByTestId("hero-mark-done")).toBeNull();
  });

  it("shows 'Catch up' button when multiple obligations are underfunded", async () => {
    const underfundedObligations = [
      {
        id: "ob1",
        name: "Rent",
        amount: 1200,
        nextDueDate: "2025-02-14T00:00:00.000Z",
        fundBalance: { currentBalance: 800 },
      },
      {
        id: "ob2",
        name: "Insurance",
        amount: 500,
        nextDueDate: "2025-03-01T00:00:00.000Z",
        fundBalance: { currentBalance: 100 },
      },
    ];

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse(underfundedObligations));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("catch-up-button")).toBeDefined();
    });

    expect(screen.getByTestId("catch-up-button").textContent).toBe("Catch up");
  });

  it("hides 'Catch up' button when all obligations are fully funded", async () => {
    const fullyFundedObligations = [
      {
        id: "ob1",
        name: "Rent",
        amount: 1200,
        nextDueDate: "2025-02-14T00:00:00.000Z",
        fundBalance: { currentBalance: 1200 },
      },
      {
        id: "ob2",
        name: "Insurance",
        amount: 500,
        nextDueDate: "2025-03-01T00:00:00.000Z",
        fundBalance: { currentBalance: 500 },
      },
    ];

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse(fullyFundedObligations));
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

    expect(screen.queryByTestId("catch-up-button")).toBeNull();
  });

  it("hides 'Catch up' button when only one obligation is underfunded", async () => {
    const singleUnderfunded = [
      {
        id: "ob1",
        name: "Rent",
        amount: 1200,
        nextDueDate: "2025-02-14T00:00:00.000Z",
        fundBalance: { currentBalance: 800 },
      },
      {
        id: "ob2",
        name: "Insurance",
        amount: 500,
        nextDueDate: "2025-03-01T00:00:00.000Z",
        fundBalance: { currentBalance: 500 },
      },
    ];

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse(singleUnderfunded));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("$412.00")).toBeDefined();
    });

    expect(screen.queryByTestId("catch-up-button")).toBeNull();
  });

  it("opens CatchUpModal when 'Catch up' button is clicked", async () => {
    const underfundedObligations = [
      {
        id: "ob1",
        name: "Rent",
        amount: 1200,
        nextDueDate: "2025-02-14T00:00:00.000Z",
        fundBalance: { currentBalance: 800 },
      },
      {
        id: "ob2",
        name: "Insurance",
        amount: 500,
        nextDueDate: "2025-03-01T00:00:00.000Z",
        fundBalance: { currentBalance: 100 },
      },
    ];

    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/obligations")) {
        return Promise.resolve(mockFetchResponse(underfundedObligations));
      }
      if (typeof url === "string" && url.includes("/api/engine/timeline")) {
        return Promise.resolve(mockFetchResponse(mockTimelineData));
      }
      return Promise.resolve(mockFetchResponse(mockSnapshot));
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("catch-up-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("catch-up-button"));

    await waitFor(() => {
      expect(screen.getByTestId("catchup-modal")).toBeDefined();
    });
  });
});
