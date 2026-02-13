import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindUnique = vi.fn();
const mockObligationFindMany = vi.fn();
const mockFundBalanceFindUnique = vi.fn();
const mockFundBalanceFindMany = vi.fn();
const mockEngineSnapshotCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findUnique: (...args: unknown[]) => mockObligationFindUnique(...args),
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    fundBalance: {
      findUnique: (...args: unknown[]) => mockFundBalanceFindUnique(...args),
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

import { PUT } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  maxContributionPerCycle: 500,
  contributionCycleDays: 14,
};

const mockObligation = {
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

const mockExistingFundBalance = {
  id: "fb_1",
  obligationId: "obl_1",
  currentBalance: 200,
  lastUpdatedAt: new Date(),
};

const mockSnapshotData = {
  totalRequired: 1500,
  totalFunded: 750,
  nextActionAmount: 107.14,
  nextActionDate: new Date("2025-06-15"),
  nextActionDescription: "Set aside $107.14 for Rent by 2025-06-15",
};

function createRequest(
  obligationId: string,
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest(
    `http://localhost/api/fund-balances/${obligationId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const routeParams = (obligationId: string) => ({
  params: Promise.resolve({ obligationId }),
});

describe("PUT /api/fund-balances/[obligationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockObligationFindUnique.mockResolvedValue(mockObligation);
    mockFundBalanceFindUnique.mockResolvedValue(mockExistingFundBalance);
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue({
              ...mockExistingFundBalance,
              currentBalance: 750,
            }),
          },
        };
        return fn(tx);
      }
    );
    mockObligationFindMany.mockResolvedValue([
      { ...mockObligation, customEntries: [] },
    ]);
    mockFundBalanceFindMany.mockResolvedValue([
      { ...mockExistingFundBalance, currentBalance: 750 },
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

    const req = createRequest("obl_1", { balance: 750 });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when balance is missing", async () => {
    const req = createRequest("obl_1", {});
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("balance is required and must be a number");
  });

  it("returns 400 when balance is not a number", async () => {
    const req = createRequest("obl_1", { balance: "abc" });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("balance is required and must be a number");
  });

  it("returns 400 when balance is negative", async () => {
    const req = createRequest("obl_1", { balance: -100 });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("balance must not be negative");
  });

  it("returns 404 when obligation does not exist", async () => {
    mockObligationFindUnique.mockResolvedValue(null);

    const req = createRequest("obl_nonexistent", { balance: 750 });
    const res = await PUT(req, routeParams("obl_nonexistent"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("obligation not found");
  });

  it("returns 404 when obligation belongs to another user", async () => {
    mockObligationFindUnique.mockResolvedValue({
      ...mockObligation,
      userId: "other_user",
    });

    const req = createRequest("obl_1", { balance: 750 });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("obligation not found");
  });

  it("updates fund balance and returns result", async () => {
    const req = createRequest("obl_1", { balance: 750 });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.obligationId).toBe("obl_1");
    expect(data.currentBalance).toBe(750);
  });

  it("creates manual_adjustment contribution record with correct adjustment amount", async () => {
    let capturedTxCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue({
              ...mockExistingFundBalance,
              currentBalance: 750,
            }),
          },
        };
        capturedTxCreate = tx.contributionRecord.create;
        return fn(tx);
      }
    );

    const req = createRequest("obl_1", { balance: 750, note: "Checked bank" });
    await PUT(req, routeParams("obl_1"));

    expect(capturedTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        obligationId: "obl_1",
        amount: 550, // 750 - 200 (previous balance)
        type: "manual_adjustment",
        note: "Checked bank",
      }),
    });
  });

  it("sets fund balance to exact value via upsert", async () => {
    let capturedTxUpsert: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue({
              ...mockExistingFundBalance,
              currentBalance: 750,
            }),
          },
        };
        capturedTxUpsert = tx.fundBalance.upsert;
        return fn(tx);
      }
    );

    const req = createRequest("obl_1", { balance: 750 });
    await PUT(req, routeParams("obl_1"));

    expect(capturedTxUpsert).toHaveBeenCalledWith({
      where: { obligationId: "obl_1" },
      create: {
        obligationId: "obl_1",
        currentBalance: 750,
      },
      update: {
        currentBalance: 750,
      },
    });
  });

  it("handles setting balance when no previous fund balance exists", async () => {
    mockFundBalanceFindUnique.mockResolvedValue(null);

    let capturedTxCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue({
              id: "fb_new",
              obligationId: "obl_1",
              currentBalance: 500,
              lastUpdatedAt: new Date(),
            }),
          },
        };
        capturedTxCreate = tx.contributionRecord.create;
        return fn(tx);
      }
    );

    const req = createRequest("obl_1", { balance: 500 });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(200);
    // Adjustment should be the full balance since previous was 0
    expect(capturedTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        obligationId: "obl_1",
        amount: 500, // 500 - 0
        type: "manual_adjustment",
      }),
    });
  });

  it("triggers engine recalculation after adjustment", async () => {
    const req = createRequest("obl_1", { balance: 750 });
    await PUT(req, routeParams("obl_1"));

    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith({
      obligations: [
        expect.objectContaining({
          id: "obl_1",
          name: "Rent",
        }),
      ],
      fundBalances: [
        {
          obligationId: "obl_1",
          currentBalance: 750,
        },
      ],
      maxContributionPerCycle: 500,
      contributionCycleDays: 14,
    });

    expect(mockEngineSnapshotCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        totalRequired: 1500,
        totalFunded: 750,
        nextActionAmount: 107.14,
        nextActionDate: new Date("2025-06-15"),
        nextActionDescription: "Set aside $107.14 for Rent by 2025-06-15",
      },
    });
  });

  it("returns 500 on internal error", async () => {
    mockObligationFindUnique.mockRejectedValue(new Error("DB error"));

    const req = createRequest("obl_1", { balance: 750 });
    const res = await PUT(req, routeParams("obl_1"));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
