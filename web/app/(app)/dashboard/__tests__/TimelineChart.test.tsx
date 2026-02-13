import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import TimelineChart from "../TimelineChart";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

// Mock recharts to render simplified elements for testing
vi.mock("recharts", () => {
  const MockResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  );
  const MockLineChart = ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data: unknown[];
  }) => (
    <div data-testid="line-chart" data-point-count={data.length}>
      {children}
    </div>
  );
  const MockLine = ({ dataKey, strokeDasharray }: { dataKey: string; strokeDasharray?: string }) => (
    <div
      data-testid={`line-${dataKey}`}
      data-dashed={strokeDasharray ? "true" : "false"}
    />
  );
  const MockXAxis = () => <div data-testid="x-axis" />;
  const MockYAxis = () => <div data-testid="y-axis" />;
  const MockCartesianGrid = () => <div data-testid="cartesian-grid" />;
  const MockTooltip = () => <div data-testid="tooltip" />;
  const MockReferenceDot = ({
    fill,
    r,
  }: {
    fill: string;
    r: number;
    x: number;
    y: number;
  }) => <div data-testid="reference-dot" data-fill={fill} data-radius={r} />;
  const MockReferenceLine = () => <div data-testid="reference-line" />;

  return {
    ResponsiveContainer: MockResponsiveContainer,
    LineChart: MockLineChart,
    Line: MockLine,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    CartesianGrid: MockCartesianGrid,
    Tooltip: MockTooltip,
    ReferenceDot: MockReferenceDot,
    ReferenceLine: MockReferenceLine,
  };
});

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockTimelineData = {
  dataPoints: [
    { date: "2025-01-01T00:00:00.000Z", projectedBalance: 1000 },
    { date: "2025-02-01T00:00:00.000Z", projectedBalance: 800 },
    { date: "2025-03-01T00:00:00.000Z", projectedBalance: 1200 },
    { date: "2025-04-01T00:00:00.000Z", projectedBalance: 600 },
    { date: "2025-05-01T00:00:00.000Z", projectedBalance: 1100 },
  ],
  expenseMarkers: [
    {
      date: "2025-02-01T00:00:00.000Z",
      obligationId: "ob1",
      obligationName: "Rent",
      amount: 2000,
    },
    {
      date: "2025-04-01T00:00:00.000Z",
      obligationId: "ob2",
      obligationName: "Insurance",
      amount: 500,
    },
  ],
  contributionMarkers: [
    { date: "2025-01-15T00:00:00.000Z", amount: 400 },
    { date: "2025-02-15T00:00:00.000Z", amount: 400 },
  ],
  crunchPoints: [
    {
      date: "2025-04-01T00:00:00.000Z",
      projectedBalance: -200,
      triggerObligationId: "ob2",
      triggerObligationName: "Insurance",
    },
  ],
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-07-01T00:00:00.000Z",
};

const mockEmptyTimeline = {
  dataPoints: [{ date: "2025-01-01T00:00:00.000Z", projectedBalance: 0 }],
  expenseMarkers: [],
  contributionMarkers: [],
  crunchPoints: [],
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-07-01T00:00:00.000Z",
};

describe("TimelineChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    render(<TimelineChart />);
    expect(screen.getByText("Loading timeline...")).toBeDefined();
  });

  it("renders chart with data points after loading", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    const chart = screen.getByTestId("line-chart");
    expect(parseInt(chart.getAttribute("data-point-count") ?? "0")).toBe(5);
  });

  it("renders the balance line", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-balance")).toBeDefined();
    });

    const line = screen.getByTestId("line-balance");
    expect(line.getAttribute("data-dashed")).toBe("false");
  });

  it("renders expense markers at correct positions", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    const dots = screen.getAllByTestId("reference-dot");
    // 2 expense markers + 1 crunch point = 3 reference dots
    expect(dots.length).toBe(3);

    const expenseDots = dots.filter(
      (d) => d.getAttribute("data-fill") === "#d69e2e"
    );
    expect(expenseDots.length).toBe(2);

    const crunchDots = dots.filter(
      (d) => d.getAttribute("data-fill") === "#e53e3e"
    );
    expect(crunchDots.length).toBe(1);
  });

  it("renders crunch points with larger radius", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    const crunchDot = screen
      .getAllByTestId("reference-dot")
      .find((d) => d.getAttribute("data-fill") === "#e53e3e");
    expect(crunchDot).toBeDefined();
    expect(crunchDot!.getAttribute("data-radius")).toBe("6");
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ error: "server error" }, 500)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Failed to load timeline"
    );
  });

  it("shows empty state with single data point", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockEmptyTimeline)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(
        screen.getByText("Add obligations to see your fund projection")
      ).toBeDefined();
    });
  });

  it("renders time range selector with all options", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    expect(screen.getByText("6mo")).toBeDefined();
    expect(screen.getByText("9mo")).toBeDefined();
    expect(screen.getByText("12mo")).toBeDefined();
  });

  it("defaults to 6 month range selected", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));

    render(<TimelineChart />);

    const btn6 = screen.getByText("6mo");
    expect(btn6.getAttribute("aria-pressed")).toBe("true");

    const btn9 = screen.getByText("9mo");
    expect(btn9.getAttribute("aria-pressed")).toBe("false");
  });

  it("changes range when a different button is clicked", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    // Initial fetch with months=6
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/engine/timeline?months=6"
    );

    fireEvent.click(screen.getByText("12mo"));

    expect(screen.getByText("12mo").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("6mo").getAttribute("aria-pressed")).toBe("false");

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "/api/engine/timeline?months=12"
      );
    });
  });

  it("renders scenario line when scenarioData is provided", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    const scenarioData = {
      ...mockTimelineData,
      dataPoints: mockTimelineData.dataPoints.map((dp) => ({
        ...dp,
        projectedBalance: dp.projectedBalance + 500,
      })),
    };

    render(<TimelineChart scenarioData={scenarioData} />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    const scenarioLine = screen.getByTestId("line-scenarioBalance");
    expect(scenarioLine).toBeDefined();
    expect(scenarioLine.getAttribute("data-dashed")).toBe("true");
  });

  it("does not render scenario line when no scenario data", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    expect(screen.queryByTestId("line-scenarioBalance")).toBeNull();
  });

  it("shows scenario legend item when scenario data is present", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart scenarioData={mockTimelineData} />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    expect(screen.getByText("Scenario")).toBeDefined();
  });

  it("renders legend items", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockTimelineData)
    );

    render(<TimelineChart />);

    await waitFor(() => {
      expect(screen.getByTestId("line-chart")).toBeDefined();
    });

    expect(screen.getByText("Projected balance")).toBeDefined();
    expect(screen.getByText("Expense due")).toBeDefined();
    expect(screen.getByText("Crunch point")).toBeDefined();
  });

  it("fetches with correct months parameter", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));

    render(<TimelineChart />);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/engine/timeline?months=6"
    );
  });
});
