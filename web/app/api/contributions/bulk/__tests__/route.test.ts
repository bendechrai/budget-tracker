import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindMany = vi.fn();
const mockFundGroupFindMany = vi.fn();
const mockEngineSnapshotCreate = vi.fn();
const mockIncomeSourceFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    fundGroup: {
      findMany: (...args: unknown[]) => mockFundGroupFindMany(...args),
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
  fundGroupId: "fg_1",
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
  fundGroupId: "fg_2",
};

const mockFundGroup1 = {
  id: "fg_1",
  userId: "user_1",
  name: "Default",
  isDefault: true,
  currentBalance: 500,
};

const mockFundGroup2 = {
  id: "fg_2",
  userId: "user_1",
  name: "Insurance Group",
  isDefault: false,
  currentBalance: 300,
};

const mockSnapshotData = {
  totalRequired: 2100,
  totalFunded: 800,
  totalContributionPerCycle: 185.71,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 185.71,
  nextActionDate: new Date("2025-06-15"),
  nextActionDescription: "Set aside $185.71 for Rent by 2025-06-15",
  nextActionFundGroupId: "fg_1",
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
    mockFundGroupFindMany
      .mockResolvedValueOnce([mockFundGroup1, mockFundGroup2])
      .mockResolvedValueOnce([mockFundGroup1, mockFundGroup2]);
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundGroup: {
            update: vi
              .fn()
              .mockResolvedValueOnce(mockFundGroup1)
              .mockResolvedValueOnce(mockFundGroup2),
          },
        };
        return fn(tx);
      }
    );
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockResolveCycleConfig.mockReturnValue({ type: "fortnightly", payDays: [] });
    mockObligationFindMany.mockResolvedValue([
      { ...mockObligation1, customEntries: [] },
      { ...mockObligation2, customEntries: [] },
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
      contributions: [{ fundGroupId: "fg_1", amount: 100 }],
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
      contributions: [{ fundGroupId: "fg_1", amount: 0 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("contribution amounts must not be zero");
  });

  it("returns 400 when a contribution has missing fundGroupId", async () => {
    const req = createRequest({
      contributions: [{ amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "each contribution must have a valid fundGroupId"
    );
  });

  it("returns 400 when a contribution has missing amount", async () => {
    const req = createRequest({
      contributions: [{ fundGroupId: "fg_1" }],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("each contribution must have a numeric amount");
  });

  it("returns 404 when a fund group does not belong to user", async () => {
    mockFundGroupFindMany.mockReset();
    mockFundGroupFindMany.mockResolvedValueOnce([
      { ...mockFundGroup1, userId: "other_user" },
    ]);

    const req = createRequest({
      contributions: [{ fundGroupId: "fg_1", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("fund group not found");
  });

  it("returns 404 when a fund group does not exist", async () => {
    mockFundGroupFindMany.mockReset();
    mockFundGroupFindMany.mockResolvedValueOnce([]);

    const req = createRequest({
      contributions: [{ fundGroupId: "fg_nonexistent", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("fund group not found");
  });

  it("creates bulk contributions and returns 201 with success", async () => {
    const req = createRequest({
      contributions: [
        { fundGroupId: "fg_1", amount: 200 },
        { fundGroupId: "fg_2", amount: 100 },
      ],
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("creates contribution records with correct note in transaction", async () => {
    let capturedTxCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          contributionRecord: {
            create: vi.fn().mockResolvedValue({ id: "cr_1" }),
          },
          fundGroup: {
            update: vi.fn().mockResolvedValue(mockFundGroup1),
          },
        };
        capturedTxCreate = tx.contributionRecord.create;
        return fn(tx);
      }
    );

    const req = createRequest({
      contributions: [{ fundGroupId: "fg_1", amount: 200 }],
    });
    await POST(req);

    expect(capturedTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fundGroupId: "fg_1",
        amount: 200,
        type: "contribution",
        note: "Lump sum catch-up",
      }),
    });
  });

  it("triggers a single engine recalculation after all contributions", async () => {
    const req = createRequest({
      contributions: [
        { fundGroupId: "fg_1", amount: 200 },
        { fundGroupId: "fg_2", amount: 100 },
      ],
    });
    await POST(req);

    expect(mockCalculateAndSnapshot).toHaveBeenCalledTimes(1);
    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith({
      obligations: expect.arrayContaining([
        expect.objectContaining({ id: "obl_1", name: "Rent" }),
        expect.objectContaining({ id: "obl_2", name: "Insurance" }),
      ]),
      fundGroupBalances: expect.arrayContaining([
        { fundGroupId: "fg_1", currentBalance: 500 },
        { fundGroupId: "fg_2", currentBalance: 300 },
      ]),
      maxContributionPerCycle: 500,
      cycleConfig: { type: "fortnightly", payDays: [] },
    });

    expect(mockEngineSnapshotCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 500 on internal error", async () => {
    mockFundGroupFindMany.mockReset();
    mockFundGroupFindMany.mockRejectedValue(new Error("DB error"));

    const req = createRequest({
      contributions: [{ fundGroupId: "fg_1", amount: 100 }],
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
