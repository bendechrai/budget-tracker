import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT } from "../route";
import { createSession } from "@/lib/auth/session";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/user/onboarding", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/user/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with updated user on valid request", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockUpdate.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      currencySymbol: "$",
      currentFundBalance: 500,
      maxContributionPerCycle: 200,
      contributionCycleDays: 14,
      onboardingComplete: true,
    });

    const res = await PUT(
      makeRequest({
        currentFundBalance: 500,
        currencySymbol: "$",
        maxContributionPerCycle: 200,
        contributionCycleDays: 14,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      id: "user_1",
      email: "test@example.com",
      currencySymbol: "$",
      currentFundBalance: 500,
      maxContributionPerCycle: 200,
      contributionCycleDays: 14,
      onboardingComplete: true,
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        currentFundBalance: 500,
        currencySymbol: "$",
        maxContributionPerCycle: 200,
        contributionCycleDays: 14,
        onboardingComplete: true,
      },
    });

    expect(createSession).toHaveBeenCalledWith("user_1", true);
  });

  it("returns 200 with null contribution fields when not provided (I'm not sure)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockUpdate.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      currencySymbol: "€",
      currentFundBalance: 0,
      maxContributionPerCycle: null,
      contributionCycleDays: null,
      onboardingComplete: true,
    });

    const res = await PUT(
      makeRequest({
        currentFundBalance: 0,
        currencySymbol: "€",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.maxContributionPerCycle).toBeNull();
    expect(data.contributionCycleDays).toBeNull();
    expect(data.onboardingComplete).toBe(true);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        currentFundBalance: 0,
        currencySymbol: "€",
        maxContributionPerCycle: null,
        contributionCycleDays: null,
        onboardingComplete: true,
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(
      makeRequest({
        currentFundBalance: 500,
        currencySymbol: "$",
      })
    );

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when currentFundBalance is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await PUT(
      makeRequest({
        currencySymbol: "$",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("currentFundBalance is required");
  });

  it("returns 400 when currentFundBalance is negative", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await PUT(
      makeRequest({
        currentFundBalance: -100,
        currencySymbol: "$",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("currentFundBalance must be a non-negative number");
  });

  it("returns 400 when currencySymbol is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await PUT(
      makeRequest({
        currentFundBalance: 500,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("currencySymbol is required");
  });

  it("returns 400 when maxContributionPerCycle is not a positive number", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await PUT(
      makeRequest({
        currentFundBalance: 500,
        currencySymbol: "$",
        maxContributionPerCycle: -50,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("maxContributionPerCycle must be a positive number");
  });

  it("returns 400 when contributionCycleDays is not a positive integer", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await PUT(
      makeRequest({
        currentFundBalance: 500,
        currencySymbol: "$",
        contributionCycleDays: 3.5,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("contributionCycleDays must be a positive integer");
  });
});
