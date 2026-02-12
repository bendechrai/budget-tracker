import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { GET } from "../route";

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/transactions");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

const sampleTransactions = [
  {
    id: "txn_2",
    userId: "user_1",
    date: "2026-02-15T00:00:00.000Z",
    description: "Grocery Store",
    amount: 85.5,
    type: "debit",
    referenceId: null,
    fingerprint: "abc123",
    sourceFileName: "statement.csv",
    importedAt: "2026-02-15T12:00:00.000Z",
    createdAt: "2026-02-15T12:00:00.000Z",
  },
  {
    id: "txn_1",
    userId: "user_1",
    date: "2026-02-01T00:00:00.000Z",
    description: "Salary Deposit",
    amount: 5000,
    type: "credit",
    referenceId: "REF001",
    fingerprint: "def456",
    sourceFileName: "statement.csv",
    importedAt: "2026-02-15T12:00:00.000Z",
    createdAt: "2026-02-15T12:00:00.000Z",
  },
];

describe("GET /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with user's transactions ordered by date desc", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue(sampleTransactions);
    mockCount.mockResolvedValue(2);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transactions).toEqual(sampleTransactions);
    expect(data.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 2,
      totalPages: 1,
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: { date: "desc" },
      skip: 0,
      take: 50,
    });
  });

  it("returns empty array when user has no transactions", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_2", email: "new@example.com" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transactions).toEqual([]);
    expect(data.pagination.total).toBe(0);
    expect(data.pagination.totalPages).toBe(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("supports pagination with page and limit params", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([sampleTransactions[0]]);
    mockCount.mockResolvedValue(55);

    const res = await GET(makeRequest({ page: "2", limit: "10" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 55,
      totalPages: 6,
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: { date: "desc" },
      skip: 10,
      take: 10,
    });
  });

  it("clamps limit to max page size of 100", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest({ limit: "500" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("defaults to page 1 and limit 50 for invalid params", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest({ page: "abc", limit: "xyz" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 })
    );
  });

  it("supports date range filtering with startDate and endDate", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([sampleTransactions[0]]);
    mockCount.mockResolvedValue(1);

    const res = await GET(makeRequest({
      startDate: "2026-02-10T00:00:00.000Z",
      endDate: "2026-02-20T00:00:00.000Z",
    }));

    expect(res.status).toBe(200);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        date: {
          gte: new Date("2026-02-10T00:00:00.000Z"),
          lte: new Date("2026-02-20T00:00:00.000Z"),
        },
      },
      orderBy: { date: "desc" },
      skip: 0,
      take: 50,
    });
  });

  it("supports filtering with only startDate", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest({ startDate: "2026-02-01T00:00:00.000Z" }));

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        date: {
          gte: new Date("2026-02-01T00:00:00.000Z"),
        },
      },
      orderBy: { date: "desc" },
      skip: 0,
      take: 50,
    });
  });

  it("supports filtering with only endDate", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest({ endDate: "2026-02-28T00:00:00.000Z" }));

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        date: {
          lte: new Date("2026-02-28T00:00:00.000Z"),
        },
      },
      orderBy: { date: "desc" },
      skip: 0,
      take: 50,
    });
  });

  it("ignores invalid date strings", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeRequest({ startDate: "not-a-date", endDate: "also-bad" }));

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: { date: "desc" },
      skip: 0,
      take: 50,
    });
  });
});
