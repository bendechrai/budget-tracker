import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindMany = vi.fn();
const mockFundBalanceFindMany = vi.fn();
const mockEngineSnapshotCreate = vi.fn();

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

const futureDate = new Date("2025-06-15");

const mockObligations = [
  {
    id: "obl_1",
    userId: "user_1",
    name: "Rent",
    type: "recurring",
    amount: 1500,
    frequency: "monthly",
    frequencyDays: null,
    nextDueDate: futureDate,
    endDate: null,
    isPaused: false,
    isActive: true,
    isArchived: false,
    fundGroupId: null,
    customEntries: [],
  },
];

const mockFundBalances = [
  {
    id: "fb_1",
    obligationId: "obl_1",
    currentBalance: 300,
    lastUpdatedAt: new Date(),
  },
];

const mockSnapshotData = {
  totalRequired: 1500,
  totalFunded: 300,
  nextActionAmount: 171.43,
  nextActionDate: futureDate,
  nextActionDescription: "Set aside $171.43 for Rent by 2025-06-15",
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
    mockObligationFindMany.mockResolvedValue(mockObligations);
    mockFundBalanceFindMany.mockResolvedValue(mockFundBalances);
    mockCalculateAndSnapshot.mockReturnValue({
      result: {},
      snapshot: mockSnapshotData,
    });
    mockEngineSnapshotCreate.mockResolvedValue(mockSavedSnapshot);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
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

  it("fetches fund balances for the user's obligations", async () => {
    await POST();

    expect(mockFundBalanceFindMany).toHaveBeenCalledWith({
      where: {
        obligation: {
          userId: "user_1",
        },
      },
    });
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
          frequency: "monthly",
          frequencyDays: null,
          nextDueDate: futureDate,
          endDate: null,
          isPaused: false,
          isActive: true,
          fundGroupId: null,
          customEntries: [],
        },
      ],
      fundBalances: [
        {
          obligationId: "obl_1",
          currentBalance: 300,
        },
      ],
      maxContributionPerCycle: 500,
      contributionCycleDays: 14,
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
      },
    });

    const data = await res.json();
    expect(data.id).toBe("snap_1");
    expect(data.userId).toBe("user_1");
    expect(data.totalRequired).toBe(1500);
    expect(data.totalFunded).toBe(300);
  });

  it("handles no obligations (empty state)", async () => {
    mockObligationFindMany.mockResolvedValue([]);
    mockFundBalanceFindMany.mockResolvedValue([]);
    mockCalculateAndSnapshot.mockReturnValue({
      result: {},
      snapshot: {
        totalRequired: 0,
        totalFunded: 0,
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
        frequency: null,
        frequencyDays: null,
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
