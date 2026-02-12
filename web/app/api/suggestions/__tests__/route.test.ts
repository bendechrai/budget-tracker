import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockSuggestionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    suggestion: {
      findMany: (...args: unknown[]) => mockSuggestionFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { GET } from "../route";

const mockUser = { id: "user_1", email: "test@example.com" };

describe("GET /api/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockSuggestionFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns empty suggestions list with count 0", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("returns pending suggestions only", async () => {
    const res = await GET();

    expect(res.status).toBe(200);

    // Verify query filters by userId and pending status
    expect(mockSuggestionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
          status: "pending",
        },
      })
    );
  });

  it("returns suggestions with linked transaction details", async () => {
    const mockSuggestions = [
      {
        id: "sug_1",
        userId: "user_1",
        type: "expense",
        vendorPattern: "Netflix",
        detectedAmount: 14.99,
        detectedAmountMin: null,
        detectedAmountMax: null,
        detectedFrequency: "monthly",
        confidence: "high",
        matchingTransactionCount: 3,
        status: "pending",
        createdAt: new Date("2024-03-01"),
        updatedAt: new Date("2024-03-01"),
        suggestionTransactions: [
          {
            suggestionId: "sug_1",
            transactionId: "txn_1",
            transaction: {
              id: "txn_1",
              date: new Date("2024-01-15"),
              description: "Netflix",
              amount: 14.99,
              type: "debit",
            },
          },
          {
            suggestionId: "sug_1",
            transactionId: "txn_2",
            transaction: {
              id: "txn_2",
              date: new Date("2024-02-15"),
              description: "Netflix",
              amount: 14.99,
              type: "debit",
            },
          },
        ],
      },
    ];
    mockSuggestionFindMany.mockResolvedValue(mockSuggestions);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.count).toBe(1);
    expect(data.suggestions[0].vendorPattern).toBe("Netflix");
    expect(data.suggestions[0].suggestionTransactions).toHaveLength(2);
    expect(data.suggestions[0].suggestionTransactions[0].transaction.id).toBe(
      "txn_1"
    );
  });

  it("includes transaction details in the query", async () => {
    await GET();

    expect(mockSuggestionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          suggestionTransactions: {
            include: {
              transaction: {
                select: {
                  id: true,
                  date: true,
                  description: true,
                  amount: true,
                  type: true,
                },
              },
            },
          },
        },
      })
    );
  });

  it("returns count for badge display", async () => {
    const mockSuggestions = [
      {
        id: "sug_1",
        vendorPattern: "Netflix",
        suggestionTransactions: [],
      },
      {
        id: "sug_2",
        vendorPattern: "Spotify",
        suggestionTransactions: [],
      },
    ];
    mockSuggestionFindMany.mockResolvedValue(mockSuggestions);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(2);
  });

  it("orders suggestions by createdAt desc", async () => {
    await GET();

    expect(mockSuggestionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          createdAt: "desc",
        },
      })
    );
  });
});
