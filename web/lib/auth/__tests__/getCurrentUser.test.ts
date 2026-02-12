// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { getCurrentUser } from "../getCurrentUser";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mockGetSession = vi.mocked(getSession);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns the user when a valid session exists", async () => {
    const fakeUser = {
      id: "user-123",
      email: "test@example.com",
      passwordHash: "hashed",
      currencySymbol: "$",
      onboardingComplete: false,
      currentFundBalance: 0,
      maxContributionPerCycle: null,
      contributionCycleDays: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockGetSession.mockResolvedValue({ userId: "user-123" });
    mockFindUnique.mockResolvedValue(fakeUser);

    const result = await getCurrentUser();

    expect(result).toEqual(fakeUser);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "user-123" },
    });
  });

  it("returns null when no session exists", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when user is not found in database", async () => {
    mockGetSession.mockResolvedValue({ userId: "nonexistent-id" });
    mockFindUnique.mockResolvedValue(null);

    const result = await getCurrentUser();

    expect(result).toBeNull();
  });

  it("returns null and logs error when an exception occurs", async () => {
    const { logError } = await import("@/lib/logging");
    const mockLogError = vi.mocked(logError);

    mockGetSession.mockRejectedValue(new Error("cookie read failed"));

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(mockLogError).toHaveBeenCalledWith(
      "Failed to get current user",
      expect.any(Error)
    );
  });
});
