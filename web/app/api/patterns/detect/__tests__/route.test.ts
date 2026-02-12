import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockDetectPatterns = vi.fn();
vi.mock("@/lib/patterns/detect", () => ({
  detectPatterns: (...args: unknown[]) => mockDetectPatterns(...args),
}));

const mockTransactionFindMany = vi.fn();
const mockIncomeSourceFindMany = vi.fn();
const mockObligationFindMany = vi.fn();
const mockSuggestionFindMany = vi.fn();
const mockSuggestionCreate = vi.fn();
const mockSuggestionTransactionCreateMany = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: (...args: unknown[]) => mockTransactionFindMany(...args),
    },
    incomeSource: {
      findMany: (...args: unknown[]) => mockIncomeSourceFindMany(...args),
    },
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    suggestion: {
      findMany: (...args: unknown[]) => mockSuggestionFindMany(...args),
      create: (...args: unknown[]) => mockSuggestionCreate(...args),
    },
    suggestionTransaction: {
      createMany: (...args: unknown[]) =>
        mockSuggestionTransactionCreateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

const mockUser = { id: "user_1", email: "test@example.com" };

describe("POST /api/patterns/detect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockTransactionFindMany.mockResolvedValue([]);
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockObligationFindMany.mockResolvedValue([]);
    mockSuggestionFindMany.mockResolvedValue([]);
    mockDetectPatterns.mockReturnValue([]);
    mockDbTransaction.mockImplementation(
      async (
        fn: (
          tx: Record<
            string,
            Record<string, (...args: unknown[]) => unknown>
          >
        ) => Promise<unknown>
      ) => {
        const tx = {
          suggestion: {
            create: mockSuggestionCreate,
          },
          suggestionTransaction: {
            createMany: mockSuggestionTransactionCreateMany,
          },
        };
        return fn(tx);
      }
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 200 with zero suggestions when no transactions exist", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newSuggestions).toBe(0);
    expect(mockDetectPatterns).toHaveBeenCalledWith([], []);
  });

  it("creates suggestions for detected patterns", async () => {
    const mockTransactions = [
      {
        id: "txn_1",
        date: new Date("2024-01-15"),
        description: "Netflix",
        amount: 14.99,
        type: "debit",
      },
      {
        id: "txn_2",
        date: new Date("2024-02-15"),
        description: "Netflix",
        amount: 14.99,
        type: "debit",
      },
      {
        id: "txn_3",
        date: new Date("2024-03-15"),
        description: "Netflix",
        amount: 14.99,
        type: "debit",
      },
    ];
    mockTransactionFindMany.mockResolvedValue(mockTransactions);

    const detectedPattern = {
      vendorPattern: "Netflix",
      type: "expense",
      detectedAmount: 14.99,
      detectedAmountMin: null,
      detectedAmountMax: null,
      detectedFrequency: "monthly",
      confidence: "high",
      matchingTransactionCount: 3,
      transactionIds: ["txn_1", "txn_2", "txn_3"],
    };
    mockDetectPatterns.mockReturnValue([detectedPattern]);
    mockSuggestionCreate.mockResolvedValue({
      id: "sug_1",
      ...detectedPattern,
      userId: "user_1",
    });

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newSuggestions).toBe(1);

    // Verify suggestion was created with correct data
    expect(mockSuggestionCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        type: "expense",
        vendorPattern: "Netflix",
        detectedAmount: 14.99,
        detectedAmountMin: null,
        detectedAmountMax: null,
        detectedFrequency: "monthly",
        confidence: "high",
        matchingTransactionCount: 3,
      },
    });

    // Verify transaction links were created
    expect(mockSuggestionTransactionCreateMany).toHaveBeenCalledWith({
      data: [
        { suggestionId: "sug_1", transactionId: "txn_1" },
        { suggestionId: "sug_1", transactionId: "txn_2" },
        { suggestionId: "sug_1", transactionId: "txn_3" },
      ],
    });
  });

  it("skips patterns that match existing income sources", async () => {
    mockTransactionFindMany.mockResolvedValue([
      {
        id: "txn_1",
        date: new Date("2024-01-01"),
        description: "Salary",
        amount: 5000,
        type: "credit",
      },
    ]);

    mockIncomeSourceFindMany.mockResolvedValue([
      { name: "Monthly Salary", expectedAmount: 5000 },
    ]);

    // detectPatterns receives the existing patterns and filters internally
    mockDetectPatterns.mockReturnValue([]);

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newSuggestions).toBe(0);

    // Verify existing patterns were passed to detectPatterns
    expect(mockDetectPatterns).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining([
        { name: "Monthly Salary", amount: 5000, type: "income" },
      ])
    );
  });

  it("skips patterns that match existing obligations", async () => {
    mockTransactionFindMany.mockResolvedValue([
      {
        id: "txn_1",
        date: new Date("2024-01-15"),
        description: "Gym",
        amount: 50,
        type: "debit",
      },
    ]);

    mockObligationFindMany.mockResolvedValue([
      { name: "Gym Membership", amount: 50 },
    ]);

    mockDetectPatterns.mockReturnValue([]);

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newSuggestions).toBe(0);

    expect(mockDetectPatterns).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining([
        { name: "Gym Membership", amount: 50, type: "expense" },
      ])
    );
  });

  it("skips patterns that already have pending suggestions", async () => {
    mockTransactionFindMany.mockResolvedValue([
      {
        id: "txn_1",
        date: new Date("2024-01-15"),
        description: "Spotify",
        amount: 12.99,
        type: "debit",
      },
    ]);

    const detectedPattern = {
      vendorPattern: "Spotify",
      type: "expense",
      detectedAmount: 12.99,
      detectedAmountMin: null,
      detectedAmountMax: null,
      detectedFrequency: "monthly",
      confidence: "medium",
      matchingTransactionCount: 2,
      transactionIds: ["txn_1"],
    };
    mockDetectPatterns.mockReturnValue([detectedPattern]);

    // Already have a pending suggestion for Spotify
    mockSuggestionFindMany.mockResolvedValue([
      { vendorPattern: "Spotify" },
    ]);

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newSuggestions).toBe(0);

    // $transaction should not have been called since all patterns were filtered
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it("scopes all queries to the authenticated user", async () => {
    const res = await POST();

    expect(res.status).toBe(200);

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
      })
    );

    expect(mockIncomeSourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", isActive: true },
      })
    );

    expect(mockObligationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", isActive: true },
      })
    );

    expect(mockSuggestionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", status: "pending" },
      })
    );
  });
});
