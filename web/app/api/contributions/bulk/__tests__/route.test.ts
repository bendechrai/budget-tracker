import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindMany = vi.fn();
const mockFundBalanceFindMany = vi.fn();
const mockEngineSnapshotCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    fundBalance: {
      findMany: (...args: unknown[]) => mockFundBalanceFindMany(...args),
    },
    engineSnapshot: {
      create: (...args: unknown[]) => mockEngineSnapshotCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockCalculateAndSnapshot = vi.fn();
vi.mock("@/lib/engine/snapshot", () => ({
  calculateAndSnapshot: (...args: unknown[]) =>
    mockCalculateAndSnapshot(...args),
}));

import { POST } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  maxContributionPerCycle: 500,
  contributionCycleDays: 14,
};

const mockObligation1 = {
  id: "obl_1",
  userId: "user_1",
  name: "Rent",
  type: "recurring",
  amount: 1500,
  frequency: "monthly",
  frequencyDays: null,
  nextDueDate: new Date("2025-06-15"),
  endDate: null,
  isPaused: false,
  isActive: true,
  isArchived: false,
  fundGroupId: null,
};

const mockObligation2 = {
  id: "obl_2",
  userId: "user_1",
  name: "Insurance",
  type: "recurring",
  amount: 600,
  frequency: "quarterly",
  frequencyDays: null,
  nextDueDate: new Date("2025-07-01"),
  endDate: null,
  isPaused: false,
  isActive: true,
  isArchived: false,
  fundGroupId: null,
};

const mockFundBalance1 = {
  id: "fb_1",
  obligationId: "obl_1",
  currentBalance: 500,
  lastUpdatedAt: new Date(),
};

const mockFundBalance2 = {
  id: "fb_2",
  obligationId: "obl_2",
  currentBalance: 300,
  lastUpdatedAt: new Date(),
};

const mockSnapshotData = {
  totalRequired: 2100,
  totalFunded: 800,
  totalContributionPerCycle: 185.71,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 185.71,
  nextActionDate: new Date("2025-06-15"),
  nextActionDescription: "Set aside $185.71 for Rent by 2025-06-15",
};

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/contributions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contributions/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    // First findMany call is for ownership check, second is for engine recalc
    mockObligationFindMany
      .mockResolvedValueOnce([mockObligation1, mockObligation2])
      .mockResolvedValueOnce([
        { ...mockObligation1, customEntries: [] },
        { ...mockObligation2, customEntries: [] },
      ]);
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi
              .fn()
              .mockResolvedValueOnce(mockFundBalance1)
              .mockResolvedValueOnce(mockFundBalance2),
          },
        };
        return fn(tx);
      }
    );
    mockFundBalanceFindMany.mockResolvedValue([
      mockFundBalance1,
      mockFundBalance2,
    ]);
    mockCalculateAndSnapshot.mockReturnValue({
      result: {},
      snapshot: mockSnapshotData,
    });
    mockEngineSnapshotCreate.mockResolvedValue({
      id: "snap_1",
      userId: "user_1",
      ...mockSnapshotData,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = createRequest({
      contributions: [{ obligationId: "obl_1", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when contributions array is missing", async () => {
    const req = createRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "contributions array is required and must not be empty"
    );
  });

  it("returns 400 when contributions array is empty", async () => {
    const req = createRequest({ contributions: [] });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "contributions array is required and must not be empty"
    );
  });

  it("returns 400 when a contribution has zero amount", async () => {
    const req = createRequest({
      contributions: [{ obligationId: "obl_1", amount: 0 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("contribution amounts must not be zero");
  });

  it("returns 400 when a contribution has missing obligationId", async () => {
    const req = createRequest({
      contributions: [{ amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "each contribution must have a valid obligationId"
    );
  });

  it("returns 400 when a contribution has missing amount", async () => {
    const req = createRequest({
      contributions: [{ obligationId: "obl_1" }],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("each contribution must have a numeric amount");
  });

  it("returns 404 when an obligation does not belong to user", async () => {
    mockObligationFindMany.mockReset();
    mockObligationFindMany.mockResolvedValueOnce([
      { ...mockObligation1, userId: "other_user" },
    ]);

    const req = createRequest({
      contributions: [{ obligationId: "obl_1", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("obligation not found");
  });

  it("returns 404 when an obligation does not exist", async () => {
    mockObligationFindMany.mockReset();
    mockObligationFindMany.mockResolvedValueOnce([]);

    const req = createRequest({
      contributions: [{ obligationId: "obl_nonexistent", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("obligation not found");
  });

  it("creates bulk contributions and returns 201 with updated balances", async () => {
    const req = createRequest({
      contributions: [
        { obligationId: "obl_1", amount: 200 },
        { obligationId: "obl_2", amount: 100 },
      ],
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.balances).toHaveLength(2);
    expect(data.balances[0].obligationId).toBe("obl_1");
    expect(data.balances[1].obligationId).toBe("obl_2");
  });

  it("creates contribution records with correct note in transaction", async () => {
    let capturedTxCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue(mockFundBalance1),
          },
        };
        capturedTxCreate = tx.contributionRecord.create;
        return fn(tx);
      }
    );

    const req = createRequest({
      contributions: [{ obligationId: "obl_1", amount: 200 }],
    });
    await POST(req);

    expect(capturedTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        obligationId: "obl_1",
        amount: 200,
        type: "contribution",
        note: "Lump sum catch-up",
      }),
    });
  });

  it("triggers a single engine recalculation after all contributions", async () => {
    const req = createRequest({
      contributions: [
        { obligationId: "obl_1", amount: 200 },
        { obligationId: "obl_2", amount: 100 },
      ],
    });
    await POST(req);

    expect(mockCalculateAndSnapshot).toHaveBeenCalledTimes(1);
    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith({
      obligations: expect.arrayContaining([
        expect.objectContaining({ id: "obl_1", name: "Rent" }),
        expect.objectContaining({ id: "obl_2", name: "Insurance" }),
      ]),
      fundBalances: expect.arrayContaining([
        { obligationId: "obl_1", currentBalance: 500 },
        { obligationId: "obl_2", currentBalance: 300 },
      ]),
      maxContributionPerCycle: 500,
      cycleConfig: { type: "fortnightly", payDays: [] },
    });

    expect(mockEngineSnapshotCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 500 on internal error", async () => {
    mockObligationFindMany.mockReset();
    mockObligationFindMany.mockRejectedValue(new Error("DB error"));

    const req = createRequest({
      contributions: [{ obligationId: "obl_1", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
