import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindMany = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incomeSource: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET, PUT } from "../route";

function makePutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/user/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("PUT /api/user/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(makePutRequest({ currencySymbol: "€" }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("updates cycle type (200)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: "weekly",
      contributionPayDays: [],
      currencySymbol: "$",
      maxContributionPerCycle: null,
    });

    const res = await PUT(makePutRequest({ contributionCycleType: "weekly" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contributionCycleType).toBe("weekly");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { contributionCycleType: "weekly" },
    });
  });

  it("updates currency symbol (200)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: null,
      contributionPayDays: [],
      currencySymbol: "€",
      maxContributionPerCycle: null,
    });

    const res = await PUT(makePutRequest({ currencySymbol: "€" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.currencySymbol).toBe("€");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { currencySymbol: "€" },
    });
  });

  it("cycle change triggers engine recalculation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: "fortnightly",
      contributionPayDays: [],
      currencySymbol: "$",
      maxContributionPerCycle: null,
    });

    await PUT(makePutRequest({ contributionCycleType: "fortnightly" }));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/engine/recalculate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("max contribution change triggers engine recalculation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: null,
      contributionPayDays: [],
      currencySymbol: "$",
      maxContributionPerCycle: 1000,
    });

    await PUT(makePutRequest({ maxContributionPerCycle: 1000 }));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/engine/recalculate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("currency-only change does not trigger recalculation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: null,
      contributionPayDays: [],
      currencySymbol: "£",
      maxContributionPerCycle: null,
    });

    await PUT(makePutRequest({ currencySymbol: "£" }));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects invalid cycle type (400)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await PUT(makePutRequest({ contributionCycleType: "daily" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid contribution cycle type");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("allows clearing cycle type to null", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: null,
      contributionPayDays: [],
      currencySymbol: "$",
      maxContributionPerCycle: null,
    });

    const res = await PUT(makePutRequest({ contributionCycleType: null }));

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { contributionCycleType: null },
    });
  });

  it("allows clearing max contribution to null", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: null,
      contributionPayDays: [],
      currencySymbol: "$",
      maxContributionPerCycle: null,
    });

    const res = await PUT(makePutRequest({ maxContributionPerCycle: null }));

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { maxContributionPerCycle: null },
    });
  });

  it("rejects empty body with no valid fields (400)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await PUT(makePutRequest({}));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("no valid fields to update");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("updates multiple fields at once", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });
    mockUserUpdate.mockResolvedValue({
      contributionCycleType: "twice_monthly",
      contributionPayDays: [1, 15],
      currencySymbol: "A$",
      maxContributionPerCycle: 750,
    });

    const res = await PUT(makePutRequest({
      contributionCycleType: "twice_monthly",
      contributionPayDays: [1, 15],
      currencySymbol: "A$",
      maxContributionPerCycle: 750,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      contributionCycleType: "twice_monthly",
      contributionPayDays: [1, 15],
      currencySymbol: "A$",
      maxContributionPerCycle: 750,
    });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        contributionCycleType: "twice_monthly",
        contributionPayDays: [1, 15],
        currencySymbol: "A$",
        maxContributionPerCycle: 750,
      },
    });
  });
});
