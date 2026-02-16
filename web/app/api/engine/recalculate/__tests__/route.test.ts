import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindMany = vi.fn();
const mockFundGroupFindMany = vi.fn();
const mockEngineSnapshotCreate = vi.fn();
const mockIncomeSourceFindMany = vi.fn();

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

const mockApplyPendingEscalations = vi.fn();
vi.mock("@/lib/engine/applyEscalations", () => ({
  applyPendingEscalations: (...args: unknown[]) =>
    mockApplyPendingEscalations(...args),
}));

const mockCalculateSteadyStatePerCycle = vi.fn();
vi.mock("@/lib/engine/timeline", () => ({
  calculateSteadyStatePerCycle: (...args: unknown[]) =>
    mockCalculateSteadyStatePerCycle(...args),
}));

import { POST } from "../route";

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  contributionCycleType: "fortnightly" as const,
  contributionPayDays: [] as number[],
};

const futureDate = new Date("2025-06-15");

const mockObligations = [
  {
    id: "obl_1",
    userId: "user_1",
    name: "Rent",
    type: "recurring",
    amount: 1500,
    intervalUnit: "month",
    intervalCount: 1,
    nextDueDate: futureDate,
    endDate: null,
    isPaused: false,
    isActive: true,
    isArchived: false,
    fundGroupId: null,
    customEntries: [],
  },
];

const mockFundGroups = [
  {
    id: "fg_1",
    userId: "user_1",
    name: "Housing",
    currentBalance: 300,
  },
];

const mockSnapshotData = {
  totalRequired: 1500,
  totalFunded: 300,
  totalContributionPerCycle: 171.43,
  cyclePeriodLabel: "per fortnight",
  nextActionAmount: 171.43,
  nextActionDate: futureDate,
  nextActionDescription: "Set aside $171.43 for Rent by 2025-06-15",
  nextActionObligationId: "obl_1",
  nextActionFundGroupId: "fg_1",
};

const mockSavedSnapshot = {
  id: "snap_1",
  userId: "user_1",
  calculatedAt: new Date(),
  ...mockSnapshotData,
};

describe("POST /api/engine/recalculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockApplyPendingEscalations.mockResolvedValue({ appliedCount: 0, updatedObligationIds: [] });
    mockObligationFindMany.mockResolvedValue(mockObligations);
    mockFundGroupFindMany.mockResolvedValue(mockFundGroups);
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockCalculateAndSnapshot.mockReturnValue({
      result: {},
      snapshot: mockSnapshotData,
    });
    mockEngineSnapshotCreate.mockResolvedValue(mockSavedSnapshot);
    mockCalculateSteadyStatePerCycle.mockReturnValue(171.43);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("fetches active income sources for cycle detection", async () => {
    await POST();

    expect(mockIncomeSourceFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1", isActive: true },
      select: { intervalUnit: true, intervalCount: true, isActive: true, isPaused: true },
    });
  });

  it("fetches active non-archived obligations for the user", async () => {
    await POST();

    expect(mockObligationFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        isActive: true,
        isArchived: false,
      },
      include: {
        customEntries: true,
      },
    });
  });

  it("fetches fund groups for the user", async () => {
    await POST();

    expect(mockFundGroupFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
    });
  });

  it("uses explicit user cycle config when set", async () => {
    await POST();

    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleConfig: { type: "fortnightly", payDays: [] },
      })
    );
  });

  it("auto-detects cycle from income sources when user has no cycle set", async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...mockUser,
      contributionCycleType: null,
      contributionPayDays: [],
    });
    mockIncomeSourceFindMany.mockResolvedValue([
      { intervalUnit: "week", intervalCount: 1, isActive: true, isPaused: false },
    ]);

    await POST();

    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleConfig: { type: "weekly", payDays: [] },
      })
    );
  });

  it("falls back to monthly when no cycle set and no income sources", async () => {
    mockGetCurrentUser.mockResolvedValue({
      ...mockUser,
      contributionCycleType: null,
      contributionPayDays: [],
    });
    mockIncomeSourceFindMany.mockResolvedValue([]);

    await POST();

    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleConfig: { type: "monthly", payDays: [1] },
      })
    );
  });

  it("calls calculateAndSnapshot with correct inputs", async () => {
    await POST();

    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith({
      obligations: [
        {
          id: "obl_1",
          name: "Rent",
          type: "recurring",
          amount: 1500,
          intervalUnit: "month",
          intervalCount: 1,
          nextDueDate: futureDate,
          endDate: null,
          isPaused: false,
          isActive: true,
          fundGroupId: null,
          customEntries: [],
        },
      ],
      fundGroupBalances: [
        {
          fundGroupId: "fg_1",
          name: "Housing",
          currentBalance: 300,
        },
      ],
      cycleConfig: { type: "fortnightly", payDays: [] },
    });
  });

  it("saves snapshot to database and returns it", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(mockEngineSnapshotCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        totalRequired: 1500,
        totalFunded: 300,
        nextActionAmount: 171.43,
        nextActionDate: futureDate,
        nextActionDescription: "Set aside $171.43 for Rent by 2025-06-15",
        nextActionObligationId: "obl_1",
        nextActionFundGroupId: "fg_1",
      },
    });

    const data = await res.json();
    expect(data.id).toBe("snap_1");
    expect(data.userId).toBe("user_1");
    expect(data.totalRequired).toBe(1500);
    expect(data.totalFunded).toBe(300);
    // Computed per-cycle fields returned alongside persisted snapshot
    expect(data.totalContributionPerCycle).toBe(171.43);
    expect(data.cyclePeriodLabel).toBe("per fortnight");
  });

  it("handles no obligations (empty state)", async () => {
    mockObligationFindMany.mockResolvedValue([]);
    mockFundGroupFindMany.mockResolvedValue([]);
    mockCalculateAndSnapshot.mockReturnValue({
      result: {},
      snapshot: {
        totalRequired: 0,
        totalFunded: 0,
        totalContributionPerCycle: 0,
        cyclePeriodLabel: "per cycle",
        nextActionAmount: 0,
        nextActionDate: new Date(),
        nextActionDescription: "Add your first obligation to get started",
      },
    });
    mockEngineSnapshotCreate.mockResolvedValue({
      id: "snap_2",
      userId: "user_1",
      calculatedAt: new Date(),
      totalRequired: 0,
      totalFunded: 0,
      nextActionAmount: 0,
      nextActionDate: new Date(),
      nextActionDescription: "Add your first obligation to get started",
    });

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalRequired).toBe(0);
    expect(data.nextActionDescription).toBe(
      "Add your first obligation to get started"
    );
  });

  it("maps custom entries correctly", async () => {
    const customDueDate = new Date("2025-07-01");
    mockObligationFindMany.mockResolvedValue([
      {
        id: "obl_2",
        userId: "user_1",
        name: "Custom Payment",
        type: "custom",
        amount: 0,
        intervalUnit: null,
        intervalCount: 1,
        nextDueDate: customDueDate,
        endDate: null,
        isPaused: false,
        isActive: true,
        isArchived: false,
        fundGroupId: "fg_1",
        customEntries: [
          { dueDate: customDueDate, amount: 200, isPaid: false },
          { dueDate: new Date("2025-08-01"), amount: 300, isPaid: true },
        ],
      },
    ]);

    await POST();

    expect(mockCalculateAndSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        obligations: [
          expect.objectContaining({
            id: "obl_2",
            type: "custom",
            customEntries: [
              { dueDate: customDueDate, amount: 200, isPaid: false },
              { dueDate: new Date("2025-08-01"), amount: 300, isPaid: true },
            ],
          }),
        ],
      })
    );
  });

  it("returns 500 on internal error", async () => {
    mockObligationFindMany.mockRejectedValue(new Error("DB error"));

    const res = await POST();

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
