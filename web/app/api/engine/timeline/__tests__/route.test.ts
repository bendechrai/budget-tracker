import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindMany = vi.fn();
const mockFundBalanceFindMany = vi.fn();
const mockIncomeSourceFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    fundBalance: {
      findMany: (...args: unknown[]) => mockFundBalanceFindMany(...args),
    },
    incomeSource: {
      findMany: (...args: unknown[]) => mockIncomeSourceFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockCalculateContributions = vi.fn();
const mockResolveCycleConfig = vi.fn();
vi.mock("@/lib/engine/calculate", async () => {
  const actual = await vi.importActual("@/lib/engine/calculate");
  return {
    ...actual,
    calculateContributions: (...args: unknown[]) =>
      mockCalculateContributions(...args),
    resolveCycleConfig: (...args: unknown[]) =>
      mockResolveCycleConfig(...args),
  };
});

const mockProjectTimeline = vi.fn();
vi.mock("@/lib/engine/timeline", () => ({
  projectTimeline: (...args: unknown[]) => mockProjectTimeline(...args),
}));

import { GET } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  maxContributionPerCycle: 500,
  contributionCycleDays: 14,
  contributionCycleType: null,
  contributionPayDays: [],
  currentFundBalance: 1000,
};

const futureDate = new Date("2025-06-15");

const mockObligations = [
  {
    id: "obl_1",
    userId: "user_1",
    name: "Rent",
    type: "recurring",
    amount: 1500,
    frequency: "monthly",
    frequencyDays: null,
    nextDueDate: futureDate,
    endDate: null,
    isPaused: false,
    isActive: true,
    isArchived: false,
    fundGroupId: null,
    customEntries: [],
  },
];

const mockFundBalances = [
  {
    id: "fb_1",
    obligationId: "obl_1",
    currentBalance: 300,
    lastUpdatedAt: new Date(),
  },
];

const mockEngineResult = {
  contributions: [],
  totalRequired: 1500,
  totalFunded: 300,
  totalContributionPerCycle: 200,
  shortfallWarnings: [],
  isFullyFunded: false,
  capacityExceeded: false,
};

const mockTimelineResult = {
  dataPoints: [
    { date: new Date("2025-01-01"), projectedBalance: 1000 },
    { date: new Date("2025-06-01"), projectedBalance: 800 },
  ],
  expenseMarkers: [],
  contributionMarkers: [],
  crunchPoints: [],
  startDate: new Date("2025-01-01"),
  endDate: new Date("2025-07-01"),
};

const defaultCycleConfig = { type: "monthly" as const, payDays: [1] };

function makeRequest(months?: number): NextRequest {
  const url = months !== undefined
    ? `http://localhost/api/engine/timeline?months=${months}`
    : "http://localhost/api/engine/timeline";
  return new NextRequest(url);
}

describe("GET /api/engine/timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockObligationFindMany.mockResolvedValue(mockObligations);
    mockFundBalanceFindMany.mockResolvedValue(mockFundBalances);
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockCalculateContributions.mockReturnValue(mockEngineResult);
    mockProjectTimeline.mockReturnValue(mockTimelineResult);
    mockResolveCycleConfig.mockReturnValue(defaultCycleConfig);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns timeline data with default 6 month range", async () => {
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        monthsAhead: 6,
      })
    );
  });

  it("respects months query parameter", async () => {
    const res = await GET(makeRequest(9));

    expect(res.status).toBe(200);
    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        monthsAhead: 9,
      })
    );
  });

  it("clamps months above 12 to 12", async () => {
    await GET(makeRequest(20));
    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        monthsAhead: 12,
      })
    );
  });

  it("clamps months at 1 to 1", async () => {
    await GET(makeRequest(1));
    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        monthsAhead: 1,
      })
    );
  });

  it("passes user's current fund balance to projection", async () => {
    await GET(makeRequest());

    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        currentFundBalance: 1000,
      })
    );
  });

  it("passes engine's total contribution per cycle to projection", async () => {
    await GET(makeRequest());

    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        contributionPerCycle: 200,
      })
    );
  });

  it("resolves cycle config with user settings and income sources", async () => {
    const weeklyConfig = { type: "weekly" as const, payDays: [] };
    mockResolveCycleConfig.mockReturnValue(weeklyConfig);

    const userWithCycle = {
      ...mockUser,
      contributionCycleType: "weekly",
      contributionPayDays: [],
    };
    mockGetCurrentUser.mockResolvedValue(userWithCycle);

    await GET(makeRequest());

    expect(mockResolveCycleConfig).toHaveBeenCalledWith(
      { contributionCycleType: "weekly", contributionPayDays: [] },
      [],
    );
    expect(mockCalculateContributions).toHaveBeenCalledWith(
      expect.objectContaining({ cycleConfig: weeklyConfig })
    );
    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ cycleConfig: weeklyConfig })
    );
  });

  it("auto-detects cycle from income sources when user has no explicit setting", async () => {
    const incomeSources = [
      { frequency: "fortnightly", isIrregular: false, isActive: true, isPaused: false },
    ];
    mockIncomeSourceFindMany.mockResolvedValue(incomeSources);

    const fortnightlyConfig = { type: "fortnightly" as const, payDays: [] };
    mockResolveCycleConfig.mockReturnValue(fortnightlyConfig);

    await GET(makeRequest());

    expect(mockIncomeSourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", isActive: true },
      })
    );
    expect(mockResolveCycleConfig).toHaveBeenCalledWith(
      { contributionCycleType: null, contributionPayDays: [] },
      incomeSources,
    );
    expect(mockCalculateContributions).toHaveBeenCalledWith(
      expect.objectContaining({ cycleConfig: fortnightlyConfig })
    );
    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ cycleConfig: fortnightlyConfig })
    );
  });

  it("returns 500 on internal error", async () => {
    mockObligationFindMany.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
