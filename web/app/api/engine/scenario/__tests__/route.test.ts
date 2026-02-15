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

const mockCalculateWithWhatIf = vi.fn();
const mockResolveCycleConfig = vi.fn();
vi.mock("@/lib/engine/calculate", () => ({
  calculateWithWhatIf: (...args: unknown[]) =>
    mockCalculateWithWhatIf(...args),
  resolveCycleConfig: (...args: unknown[]) =>
    mockResolveCycleConfig(...args),
}));

const mockGenerateSnapshot = vi.fn();
vi.mock("@/lib/engine/snapshot", () => ({
  generateSnapshot: (...args: unknown[]) =>
    mockGenerateSnapshot(...args),
}));

const mockProjectTimeline = vi.fn();
vi.mock("@/lib/engine/timeline", () => ({
  projectTimeline: (...args: unknown[]) =>
    mockProjectTimeline(...args),
}));

import { POST } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  maxContributionPerCycle: 500,
  currentFundBalance: 1000,
  contributionCycleType: "fortnightly" as const,
  contributionPayDays: [] as number[],
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

const mockScenarioResult = {
  contributions: [],
  shortfalls: [],
  totalContributionPerCycle: 171.43,
};

const mockSnapshotData = {
  totalRequired: 1500,
  totalFunded: 300,
  totalContributionPerCycle: 171.43,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 171.43,
  nextActionDate: futureDate,
  nextActionDescription: "Set aside $171.43 this fortnight for Rent",
};

const mockTimelineData = {
  dataPoints: [],
  crunchPoints: [],
};

function createRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/engine/scenario", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/engine/scenario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockObligationFindMany.mockResolvedValue(mockObligations);
    mockFundBalanceFindMany.mockResolvedValue(mockFundBalances);
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockResolveCycleConfig.mockReturnValue({ type: "fortnightly", payDays: [] });
    mockCalculateWithWhatIf.mockReturnValue({
      actual: mockScenarioResult,
      scenario: mockScenarioResult,
    });
    mockGenerateSnapshot.mockReturnValue(mockSnapshotData);
    mockProjectTimeline.mockReturnValue(mockTimelineData);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(createRequest());

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("fetches active income sources for cycle detection", async () => {
    await POST(createRequest());

    expect(mockIncomeSourceFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1", isActive: true },
      select: { frequency: true, isIrregular: true, isActive: true, isPaused: true },
    });
  });

  it("calls resolveCycleConfig with user settings and income sources", async () => {
    const mockIncome = [
      { frequency: "weekly", isIrregular: false, isActive: true, isPaused: false },
    ];
    mockIncomeSourceFindMany.mockResolvedValue(mockIncome);

    await POST(createRequest());

    expect(mockResolveCycleConfig).toHaveBeenCalledWith(
      {
        contributionCycleType: "fortnightly",
        contributionPayDays: [],
      },
      mockIncome,
    );
  });

  it("uses resolved cycle config in engine calculation", async () => {
    mockResolveCycleConfig.mockReturnValue({ type: "monthly", payDays: [1] });

    await POST(createRequest());

    expect(mockCalculateWithWhatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleConfig: { type: "monthly", payDays: [1] },
      }),
      expect.anything(),
    );
  });

  it("auto-detects cycle from income sources when user has no cycle set", async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...mockUser,
      contributionCycleType: null,
      contributionPayDays: [],
    });
    mockIncomeSourceFindMany.mockResolvedValue([
      { frequency: "weekly", isIrregular: false, isActive: true, isPaused: false },
    ]);

    await POST(createRequest());

    expect(mockResolveCycleConfig).toHaveBeenCalledWith(
      {
        contributionCycleType: null,
        contributionPayDays: [],
      },
      [{ frequency: "weekly", isIrregular: false, isActive: true, isPaused: false }],
    );
  });

  it("passes resolved cycle config to scenario snapshot generation", async () => {
    mockResolveCycleConfig.mockReturnValue({ type: "twice_monthly", payDays: [1, 15] });

    await POST(createRequest());

    expect(mockGenerateSnapshot).toHaveBeenCalledWith(
      mockScenarioResult,
      { type: "twice_monthly", payDays: [1, 15] },
    );
  });

  it("passes resolved cycle config to timeline projection", async () => {
    mockResolveCycleConfig.mockReturnValue({ type: "weekly", payDays: [] });

    await POST(createRequest());

    expect(mockProjectTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleConfig: { type: "weekly", payDays: [] },
      }),
    );
  });

  it("returns snapshot and timeline in response", async () => {
    const res = await POST(createRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.snapshot).toEqual(JSON.parse(JSON.stringify(mockSnapshotData)));
    expect(data.timeline).toEqual(mockTimelineData);
  });

  it("returns 500 on internal error", async () => {
    mockObligationFindMany.mockRejectedValue(new Error("DB error"));

    const res = await POST(createRequest());

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
