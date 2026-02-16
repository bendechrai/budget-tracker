import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindMany = vi.fn();
const mockFundGroupFindUnique = vi.fn();
const mockFundGroupFindMany = vi.fn();
const mockFundGroupUpdate = vi.fn();
const mockEngineSnapshotCreate = vi.fn();
const mockIncomeSourceFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    fundGroup: {
      findUnique: (...args: unknown[]) => mockFundGroupFindUnique(...args),
      findMany: (...args: unknown[]) => mockFundGroupFindMany(...args),
      update: (...args: unknown[]) => mockFundGroupUpdate(...args),
    },
    engineSnapshot: {
      create: (...args: unknown[]) => mockEngineSnapshotCreate(...args),
    },
    incomeSource: {
      findMany: (...args: unknown[]) => mockIncomeSourceFindMany(...args),
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

const mockResolveCycleConfig = vi.fn();
vi.mock("@/lib/engine/calculate", () => ({
  resolveCycleConfig: (...args: unknown[]) =>
    mockResolveCycleConfig(...args),
}));

import { POST } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  maxContributionPerCycle: 500,
  contributionCycleType: "fortnightly" as const,
  contributionPayDays: [] as number[],
};

const mockFundGroup = {
  id: "fg_1",
  userId: "user_1",
  name: "Default",
  isDefault: true,
  currentBalance: 200,
};

const mockObligation = {
  id: "obl_1",
  userId: "user_1",
  name: "Rent",
  type: "recurring",
  amount: 1500,
  intervalUnit: "month",
  intervalCount: 1,
  nextDueDate: new Date("2025-06-15"),
  endDate: null,
  isPaused: false,
  isActive: true,
  isArchived: false,
  fundGroupId: "fg_1",
};

const mockUpdatedFundGroup = {
  id: "fg_1",
  userId: "user_1",
  name: "Default",
  isDefault: true,
  currentBalance: 300,
};

const mockSnapshotData = {
  totalRequired: 1500,
  totalFunded: 200,
  totalContributionPerCycle: 185.71,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 185.71,
  nextActionDate: new Date("2025-06-15"),
  nextActionDescription: "Set aside $185.71 for Rent by 2025-06-15",
  nextActionFundGroupId: "fg_1",
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
    mockFundGroupFindUnique.mockResolvedValue(mockFundGroup);
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundGroup: {
            update: vi.fn().mockResolvedValue(mockUpdatedFundGroup),
          },
        };
        return fn(tx);
      }
    );
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockResolveCycleConfig.mockReturnValue({ type: "fortnightly", payDays: [] });
    mockObligationFindMany.mockResolvedValue([
      { ...mockObligation, customEntries: [] },
    ]);
    mockFundGroupFindMany.mockResolvedValue([mockUpdatedFundGroup]);
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
      fundGroupId: "fg_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when fundGroupId is missing", async () => {
    const req = createRequest({
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("fundGroupId is required");
  });

  it("returns 400 when amount is missing", async () => {
    const req = createRequest({
      fundGroupId: "fg_1",
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("amount is required and must be a number");
  });

  it("returns 400 when type is invalid", async () => {
    const req = createRequest({
      fundGroupId: "fg_1",
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

  it("returns 404 when fund group does not exist", async () => {
    mockFundGroupFindUnique.mockResolvedValue(null);

    const req = createRequest({
      fundGroupId: "fg_nonexistent",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("fund group not found");
  });

  it("returns 404 when fund group belongs to another user", async () => {
    mockFundGroupFindUnique.mockResolvedValue({
      ...mockFundGroup,
      userId: "other_user",
    });

    const req = createRequest({
      fundGroupId: "fg_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("fund group not found");
  });

  it("records a contribution and returns updated fund group", async () => {
    const req = createRequest({
      fundGroupId: "fg_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("fg_1");
    expect(data.currentBalance).toBe(300);
  });

  it("creates contribution record in transaction", async () => {
    let capturedTxCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundGroup: {
            update: vi.fn().mockResolvedValue(mockUpdatedFundGroup),
          },
        };
        capturedTxCreate = tx.contributionRecord.create;
        return fn(tx);
      }
    );

    const req = createRequest({
      fundGroupId: "fg_1",
      amount: 100,
      type: "contribution",
      note: "Weekly savings",
    });
    await POST(req);

    expect(capturedTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fundGroupId: "fg_1",
        amount: 100,
        type: "contribution",
        note: "Weekly savings",
      }),
    });
  });

  it("updates fund group balance in transaction", async () => {
    let capturedTxUpdate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundGroup: {
            update: vi.fn().mockResolvedValue(mockUpdatedFundGroup),
          },
        };
        capturedTxUpdate = tx.fundGroup.update;
        return fn(tx);
      }
    );

    const req = createRequest({
      fundGroupId: "fg_1",
      amount: 100,
      type: "contribution",
    });
    await POST(req);

    expect(capturedTxUpdate).toHaveBeenCalledWith({
      where: { id: "fg_1" },
      data: {
        currentBalance: {
          increment: 100,
        },
      },
    });
  });

  it("records a manual adjustment", async () => {
    const req = createRequest({
      fundGroupId: "fg_1",
      amount: -50,
      type: "manual_adjustment",
      note: "Correction",
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  it("triggers engine recalculation after recording contribution", async () => {
    const req = createRequest({
      fundGroupId: "fg_1",
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
      fundGroupBalances: [
        {
          fundGroupId: "fg_1",
          name: "Default",
          currentBalance: 300,
        },
      ],
      maxContributionPerCycle: 500,
      cycleConfig: { type: "fortnightly", payDays: [] },
    });

    expect(mockEngineSnapshotCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        totalRequired: 1500,
        totalFunded: 200,
        nextActionAmount: 185.71,
        nextActionDate: new Date("2025-06-15"),
        nextActionDescription: "Set aside $185.71 for Rent by 2025-06-15",
        nextActionFundGroupId: "fg_1",
      },
    });
  });

  it("returns 500 on internal error", async () => {
    mockFundGroupFindUnique.mockRejectedValue(new Error("DB error"));

    const req = createRequest({
      fundGroupId: "fg_1",
      amount: 100,
      type: "contribution",
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
