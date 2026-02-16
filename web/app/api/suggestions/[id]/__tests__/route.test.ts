import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockSuggestionFindUnique = vi.fn();
const mockSuggestionUpdate = vi.fn();
const mockIncomeSourceCreate = vi.fn();
const mockObligationCreate = vi.fn();
const mockFundGroupFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    suggestion: {
      findUnique: (...args: unknown[]) => mockSuggestionFindUnique(...args),
      update: (...args: unknown[]) => mockSuggestionUpdate(...args),
    },
    incomeSource: {
      create: (...args: unknown[]) => mockIncomeSourceCreate(...args),
    },
    obligation: {
      create: (...args: unknown[]) => mockObligationCreate(...args),
    },
    fundGroup: {
      findFirst: (...args: unknown[]) => mockFundGroupFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT } from "../route";

const mockUser = { id: "user_1", email: "test@example.com" };

const mockPendingSuggestion = {
  id: "sug_1",
  userId: "user_1",
  type: "expense",
  vendorPattern: "Netflix",
  detectedAmount: 14.99,
  detectedAmountMin: null,
  detectedAmountMax: null,
  detectedIntervalUnit: "month",
  detectedIntervalCount: 1,
  confidence: "high",
  matchingTransactionCount: 3,
  status: "pending",
  linkedIncomeSourceId: null,
  linkedObligationId: null,
  createdAt: new Date("2024-03-01"),
  updatedAt: new Date("2024-03-01"),
  suggestionTransactions: [],
};

const mockIncomeSuggestion = {
  ...mockPendingSuggestion,
  id: "sug_2",
  type: "income",
  vendorPattern: "Employer Inc",
  detectedAmount: 5000,
  detectedAmountMin: 4800,
  detectedAmountMax: 5200,
  detectedIntervalUnit: "month",
  detectedIntervalCount: 1,
  suggestionTransactions: [],
};

const mockIrregularIncomeSuggestion = {
  ...mockPendingSuggestion,
  id: "sug_3",
  type: "income",
  vendorPattern: "Freelance Gigs",
  detectedAmount: 500,
  detectedAmountMin: 200,
  detectedAmountMax: 800,
  detectedIntervalUnit: null,
  detectedIntervalCount: null,
  suggestionTransactions: [
    {
      transaction: {
        id: "t1",
        date: new Date("2025-10-01"),
        amount: 200,
      },
    },
    {
      transaction: {
        id: "t2",
        date: new Date("2025-11-15"),
        amount: 500,
      },
    },
    {
      transaction: {
        id: "t3",
        date: new Date("2025-12-20"),
        amount: 800,
      },
    },
  ],
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/suggestions/sug_1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupTransaction() {
  mockTransaction.mockImplementation(
    async (fn: (tx: Record<string, Record<string, (...args: unknown[]) => unknown>>) => Promise<unknown>) => {
      const txClient = {
        incomeSource: {
          create: (...args: unknown[]) => mockIncomeSourceCreate(...args),
        },
        obligation: {
          create: (...args: unknown[]) => mockObligationCreate(...args),
        },
        suggestion: {
          update: (...args: unknown[]) => mockSuggestionUpdate(...args),
        },
        fundGroup: {
          findFirst: (...args: unknown[]) => mockFundGroupFindFirst(...args),
        },
      };
      return fn(txClient);
    }
  );
}

const params = Promise.resolve({ id: "sug_1" });

describe("PUT /api/suggestions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockSuggestionFindUnique.mockResolvedValue(mockPendingSuggestion);
    mockSuggestionUpdate.mockResolvedValue({
      ...mockPendingSuggestion,
      status: "dismissed",
    });
    mockFundGroupFindFirst.mockResolvedValue({
      id: "fg_default",
      userId: "user_1",
      name: "Default Sinking Fund",
      isDefault: true,
    });
    setupTransaction();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(makeRequest({ action: "dismiss" }), { params });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 for invalid action", async () => {
    const res = await PUT(makeRequest({ action: "invalid" }), { params });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("action must be 'accept' or 'dismiss'");
  });

  it("returns 400 for missing action", async () => {
    const res = await PUT(makeRequest({}), { params });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("action must be 'accept' or 'dismiss'");
  });

  it("returns 404 when suggestion not found", async () => {
    mockSuggestionFindUnique.mockResolvedValue(null);

    const res = await PUT(makeRequest({ action: "dismiss" }), { params });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("suggestion not found");
  });

  it("returns 404 when suggestion belongs to another user", async () => {
    mockSuggestionFindUnique.mockResolvedValue({
      ...mockPendingSuggestion,
      userId: "other_user",
    });

    const res = await PUT(makeRequest({ action: "dismiss" }), { params });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("suggestion not found");
  });

  it("returns 400 when suggestion is not pending", async () => {
    mockSuggestionFindUnique.mockResolvedValue({
      ...mockPendingSuggestion,
      status: "accepted",
    });

    const res = await PUT(makeRequest({ action: "dismiss" }), { params });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("suggestion is not pending");
  });

  describe("dismiss", () => {
    it("sets status to dismissed", async () => {
      const dismissedSuggestion = {
        ...mockPendingSuggestion,
        status: "dismissed",
      };
      mockSuggestionUpdate.mockResolvedValue(dismissedSuggestion);

      const res = await PUT(makeRequest({ action: "dismiss" }), { params });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("dismissed");
      expect(mockSuggestionUpdate).toHaveBeenCalledWith({
        where: { id: "sug_1" },
        data: { status: "dismissed" },
      });
    });
  });

  describe("accept expense suggestion", () => {
    it("creates an obligation with detected values", async () => {
      const mockObligation = {
        id: "obl_1",
        userId: "user_1",
        name: "Netflix",
        type: "recurring",
        amount: 14.99,
        intervalUnit: "month",
        intervalCount: 1,
      };
      const updatedSuggestion = {
        ...mockPendingSuggestion,
        status: "accepted",
        linkedObligationId: "obl_1",
      };

      mockObligationCreate.mockResolvedValue(mockObligation);
      mockSuggestionUpdate.mockResolvedValue(updatedSuggestion);

      const res = await PUT(makeRequest({ action: "accept" }), { params });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.suggestion.status).toBe("accepted");
      expect(data.suggestion.linkedObligationId).toBe("obl_1");
      expect(data.obligation.name).toBe("Netflix");

      expect(mockObligationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            name: "Netflix",
            type: "recurring",
            amount: 14.99,
            intervalUnit: "month",
            intervalCount: 1,
          }),
        })
      );
    });

    it("creates an obligation with tweaked values", async () => {
      const mockObligation = {
        id: "obl_1",
        userId: "user_1",
        name: "Netflix Premium",
        type: "recurring",
        amount: 22.99,
        intervalUnit: "month",
        intervalCount: 1,
      };
      const updatedSuggestion = {
        ...mockPendingSuggestion,
        status: "accepted",
        linkedObligationId: "obl_1",
      };

      mockObligationCreate.mockResolvedValue(mockObligation);
      mockSuggestionUpdate.mockResolvedValue(updatedSuggestion);

      const res = await PUT(
        makeRequest({
          action: "accept",
          name: "Netflix Premium",
          amount: 22.99,
        }),
        { params }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.obligation.name).toBe("Netflix Premium");
      expect(data.obligation.amount).toBe(22.99);

      expect(mockObligationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Netflix Premium",
            amount: 22.99,
          }),
        })
      );
    });
  });

  describe("accept income suggestion", () => {
    beforeEach(() => {
      mockSuggestionFindUnique.mockResolvedValue(mockIncomeSuggestion);
    });

    it("creates an income source with detected values", async () => {
      const mockIncomeSource = {
        id: "inc_1",
        userId: "user_1",
        name: "Employer Inc",
        expectedAmount: 5000,
        intervalUnit: "month",
        intervalCount: 1,
      };
      const updatedSuggestion = {
        ...mockIncomeSuggestion,
        status: "accepted",
        linkedIncomeSourceId: "inc_1",
      };

      mockIncomeSourceCreate.mockResolvedValue(mockIncomeSource);
      mockSuggestionUpdate.mockResolvedValue(updatedSuggestion);

      const incomParams = Promise.resolve({ id: "sug_2" });
      const res = await PUT(makeRequest({ action: "accept" }), {
        params: incomParams,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.suggestion.status).toBe("accepted");
      expect(data.suggestion.linkedIncomeSourceId).toBe("inc_1");
      expect(data.incomeSource.name).toBe("Employer Inc");

      expect(mockIncomeSourceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            name: "Employer Inc",
            expectedAmount: 5000,
            intervalUnit: "month",
            intervalCount: 1,
            minimumExpected: 4800,
          }),
        })
      );
    });

    it("creates an income source with tweaked values", async () => {
      const mockIncomeSource = {
        id: "inc_1",
        userId: "user_1",
        name: "My Salary",
        expectedAmount: 5500,
        intervalUnit: "week",
        intervalCount: 2,
      };
      const updatedSuggestion = {
        ...mockIncomeSuggestion,
        status: "accepted",
        linkedIncomeSourceId: "inc_1",
      };

      mockIncomeSourceCreate.mockResolvedValue(mockIncomeSource);
      mockSuggestionUpdate.mockResolvedValue(updatedSuggestion);

      const incomParams = Promise.resolve({ id: "sug_2" });
      const res = await PUT(
        makeRequest({
          action: "accept",
          name: "My Salary",
          amount: 5500,
          intervalUnit: "week",
          intervalCount: 2,
        }),
        { params: incomParams }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.incomeSource.name).toBe("My Salary");
      expect(data.incomeSource.expectedAmount).toBe(5500);

      expect(mockIncomeSourceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "My Salary",
            expectedAmount: 5500,
            intervalUnit: "week",
            intervalCount: 2,
          }),
        })
      );
    });
  });

  describe("accept irregular income suggestion", () => {
    beforeEach(() => {
      mockSuggestionFindUnique.mockResolvedValue(mockIrregularIncomeSuggestion);
    });

    it("computes a baseline for irregular income", async () => {
      const mockIncomeSource = {
        id: "inc_1",
        userId: "user_1",
        name: "Freelance Gigs (irregular baseline)",
        expectedAmount: 500,
        intervalUnit: "month",
        intervalCount: 1,
      };
      const updatedSuggestion = {
        ...mockIrregularIncomeSuggestion,
        status: "accepted",
        linkedIncomeSourceId: "inc_1",
      };

      mockIncomeSourceCreate.mockResolvedValue(mockIncomeSource);
      mockSuggestionUpdate.mockResolvedValue(updatedSuggestion);

      const irregularParams = Promise.resolve({ id: "sug_3" });
      const res = await PUT(makeRequest({ action: "accept" }), {
        params: irregularParams,
      });

      expect(res.status).toBe(200);

      expect(mockIncomeSourceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Freelance Gigs (irregular baseline)",
            intervalUnit: expect.stringMatching(/^(week|month)$/),
            intervalCount: 1,
            minimumExpected: 200,
          }),
        })
      );
    });
  });
});
