import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindUnique = vi.fn();
const mockObligationFindMany = vi.fn();
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

const mockFundBalanceResult = {
  id: "fb_1",
  obligationId: "obl_1",
  currentBalance: 200,
  lastUpdatedAt: new Date(),
};

const mockSnapshotData = {
  totalRequired: 1500,
  totalFunded: 200,
  nextActionAmount: 185.71,
  nextActionDate: new Date("2025-06-15"),
  nextActionDescription: "Set aside $185.71 for Rent by 2025-06-15",
};

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/contributions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contributions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockObligationFindUnique.mockResolvedValue(mockObligation);
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue(mockFundBalanceResult),
          },
        };
        return fn(tx);
      }
    );
    mockObligationFindMany.mockResolvedValue([
      { ...mockObligation, customEntries: [] },
    ]);
    mockFundBalanceFindMany.mockResolvedValue([mockFundBalanceResult]);
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
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when obligationId is missing", async () => {
    const req = createRequest({
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("obligationId is required");
  });

  it("returns 400 when amount is missing", async () => {
    const req = createRequest({
      obligationId: "obl_1",
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("amount is required and must be a number");
  });

  it("returns 400 when type is invalid", async () => {
    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "invalid_type",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "type must be one of: contribution, manual_adjustment"
    );
  });

  it("returns 404 when obligation does not exist", async () => {
    mockObligationFindUnique.mockResolvedValue(null);

    const req = createRequest({
      obligationId: "obl_nonexistent",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("obligation not found");
  });

  it("returns 404 when obligation belongs to another user", async () => {
    mockObligationFindUnique.mockResolvedValue({
      ...mockObligation,
      userId: "other_user",
    });

    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("obligation not found");
  });

  it("records a contribution and returns updated fund balance", async () => {
    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.obligationId).toBe("obl_1");
    expect(data.currentBalance).toBe(200);
  });

  it("creates contribution record in transaction", async () => {
    let capturedTxCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue(mockFundBalanceResult),
          },
        };
        capturedTxCreate = tx.contributionRecord.create;
        return fn(tx);
      }
    );

    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
      note: "Weekly savings",
    });
    await POST(req);

    expect(capturedTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        obligationId: "obl_1",
        amount: 100,
        type: "contribution",
        note: "Weekly savings",
      }),
    });
  });

  it("upserts fund balance in transaction", async () => {
    let capturedTxUpsert: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundBalance: {
            upsert: vi.fn().mockResolvedValue(mockFundBalanceResult),
          },
        };
        capturedTxUpsert = tx.fundBalance.upsert;
        return fn(tx);
      }
    );

    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
    });
    await POST(req);

    expect(capturedTxUpsert).toHaveBeenCalledWith({
      where: { obligationId: "obl_1" },
      create: {
        obligationId: "obl_1",
        currentBalance: 100,
      },
      update: {
        currentBalance: {
          increment: 100,
        },
      },
    });
  });

  it("records a manual adjustment", async () => {
    const req = createRequest({
      obligationId: "obl_1",
      amount: -50,
      type: "manual_adjustment",
      note: "Correction",
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  it("triggers engine recalculation after recording contribution", async () => {
    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
    });
    await POST(req);

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
          currentBalance: 200,
        },
      ],
      maxContributionPerCycle: 500,
      contributionCycleDays: 14,
    });

    expect(mockEngineSnapshotCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        totalRequired: 1500,
        totalFunded: 200,
        nextActionAmount: 185.71,
        nextActionDate: new Date("2025-06-15"),
        nextActionDescription: "Set aside $185.71 for Rent by 2025-06-15",
      },
    });
  });

  it("returns 500 on internal error", async () => {
    mockObligationFindUnique.mockRejectedValue(new Error("DB error"));

    const req = createRequest({
      obligationId: "obl_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
