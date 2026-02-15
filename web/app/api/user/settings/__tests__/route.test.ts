import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incomeSource: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockResolveCycleConfig = vi.fn();

vi.mock("@/lib/engine/calculate", () => ({
  resolveCycleConfig: (...args: unknown[]) => mockResolveCycleConfig(...args),
}));

import { GET } from "../route";

describe("GET /api/user/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with user settings", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      contributionCycleType: "monthly",
      contributionPayDays: [1],
      currencySymbol: "$",
      maxContributionPerCycle: 500,
    });

    mockFindMany.mockResolvedValue([
      { frequency: "monthly", isIrregular: false, isActive: true, isPaused: false },
    ]);

    mockResolveCycleConfig.mockReturnValue({ type: "monthly", payDays: [1] });

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      email: "test@example.com",
      contributionCycleType: "monthly",
      contributionPayDays: [1],
      currencySymbol: "$",
      maxContributionPerCycle: 500,
      autoDetectedCycle: { type: "monthly", payDays: [1] },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("includes auto-detected cycle from income sources", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      contributionCycleType: null,
      contributionPayDays: [],
      currencySymbol: "£",
      maxContributionPerCycle: null,
    });

    mockFindMany.mockResolvedValue([
      { frequency: "fortnightly", isIrregular: false, isActive: true, isPaused: false },
    ]);

    mockResolveCycleConfig.mockReturnValue({ type: "fortnightly", payDays: [] });

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();

    // Auto-detected should pass null cycleType to resolveCycleConfig (ignoring user setting)
    expect(mockResolveCycleConfig).toHaveBeenCalledWith(
      { contributionCycleType: null, contributionPayDays: [] },
      [{ frequency: "fortnightly", isIrregular: false, isActive: true, isPaused: false }],
    );

    expect(data.autoDetectedCycle).toEqual({ type: "fortnightly", payDays: [] });
    expect(data.contributionCycleType).toBeNull();
    expect(data.currencySymbol).toBe("£");
    expect(data.maxContributionPerCycle).toBeNull();
  });
});
