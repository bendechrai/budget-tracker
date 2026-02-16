import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFundGroupFindUnique = vi.fn();
const mockObligationFindUnique = vi.fn();
const mockContributionRecordFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundGroup: {
      findUnique: (...args: unknown[]) => mockFundGroupFindUnique(...args),
    },
    obligation: {
      findUnique: (...args: unknown[]) => mockObligationFindUnique(...args),
    },
    contributionRecord: {
      findMany: (...args: unknown[]) => mockContributionRecordFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { GET } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
};

const mockFundGroup = {
  id: "fg_1",
  userId: "user_1",
  name: "Default Sinking Fund",
};

const mockContributions = [
  {
    id: "cr_2",
    fundGroupId: "fg_1",
    amount: 200,
    date: new Date("2025-06-10"),
    type: "contribution",
    note: null,
    createdAt: new Date("2025-06-10"),
  },
  {
    id: "cr_1",
    fundGroupId: "fg_1",
    amount: 100,
    date: new Date("2025-06-01"),
    type: "contribution",
    note: "Weekly savings",
    createdAt: new Date("2025-06-01"),
  },
];

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/api/contributions/fg_1", {
    method: "GET",
  });
}

function createParams(obligationId: string): Promise<{ obligationId: string }> {
  return Promise.resolve({ obligationId });
}

describe("GET /api/contributions/[obligationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockFundGroupFindUnique.mockResolvedValue(mockFundGroup);
    mockObligationFindUnique.mockResolvedValue(null);
    mockContributionRecordFindMany.mockResolvedValue(mockContributions);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(createRequest(), { params: createParams("fg_1") });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 404 when neither fund group nor obligation exists", async () => {
    mockFundGroupFindUnique.mockResolvedValue(null);
    mockObligationFindUnique.mockResolvedValue(null);

    const res = await GET(createRequest(), { params: createParams("nonexistent") });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
  });

  it("returns 404 when fund group belongs to another user", async () => {
    mockFundGroupFindUnique.mockResolvedValue({
      ...mockFundGroup,
      userId: "other_user",
    });
    mockObligationFindUnique.mockResolvedValue(null);

    const res = await GET(createRequest(), { params: createParams("fg_1") });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
  });

  it("returns contributions for the user's fund group", async () => {
    const res = await GET(createRequest(), { params: createParams("fg_1") });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("cr_2");
    expect(data[1].id).toBe("cr_1");
  });

  it("queries contributions ordered by date desc", async () => {
    await GET(createRequest(), { params: createParams("fg_1") });

    expect(mockContributionRecordFindMany).toHaveBeenCalledWith({
      where: { fundGroupId: "fg_1" },
      orderBy: { date: "desc" },
    });
  });

  it("returns empty array when no contributions exist", async () => {
    mockContributionRecordFindMany.mockResolvedValue([]);

    const res = await GET(createRequest(), { params: createParams("fg_1") });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(0);
  });

  it("returns 500 on internal error", async () => {
    mockFundGroupFindUnique.mockRejectedValue(new Error("DB error"));

    const res = await GET(createRequest(), { params: createParams("fg_1") });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
