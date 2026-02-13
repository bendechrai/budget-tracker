// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEscalationFindMany = vi.fn();
const mockObligationUpdate = vi.fn();
const mockEscalationUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    escalation: {
      findMany: (...args: unknown[]) => mockEscalationFindMany(...args),
      update: (...args: unknown[]) => mockEscalationUpdate(...args),
    },
    obligation: {
      update: (...args: unknown[]) => mockObligationUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import {
  applyPendingEscalations,
  applyDeferredEscalations,
} from "../applyEscalations";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function setupTransaction() {
  mockTransaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txClient = {
        obligation: {
          update: mockObligationUpdate,
        },
        escalation: {
          update: mockEscalationUpdate,
        },
      };
      return fn(txClient);
    }
  );
}

function makeEscalationWithObligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "esc-1",
    obligationId: "obl-1",
    changeType: "absolute",
    value: 2200,
    effectiveDate: new Date("2026-06-01"),
    intervalMonths: null,
    isApplied: false,
    appliedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    obligation: {
      id: "obl-1",
      userId: "user-1",
      name: "Rent",
      type: "recurring",
      amount: 2000,
      isPaused: false,
      isActive: true,
      isArchived: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupTransaction();
  mockObligationUpdate.mockResolvedValue({});
  mockEscalationUpdate.mockResolvedValue({});
});

describe("applyPendingEscalations", () => {
  it("applies past-date one-off absolute rule", async () => {
    const rule = makeEscalationWithObligation({
      changeType: "absolute",
      value: 2200,
      effectiveDate: new Date("2026-06-01"),
    });
    mockEscalationFindMany.mockResolvedValue([rule]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(1);
    expect(result.updatedObligationIds).toEqual(["obl-1"]);

    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 2200 },
    });

    expect(mockEscalationUpdate).toHaveBeenCalledWith({
      where: { id: "esc-1" },
      data: {
        isApplied: true,
        appliedAt: NOW,
      },
    });
  });

  it("applies past-date one-off percentage rule", async () => {
    const rule = makeEscalationWithObligation({
      changeType: "percentage",
      value: 10,
      effectiveDate: new Date("2026-05-01"),
      obligation: {
        id: "obl-1",
        userId: "user-1",
        name: "Rent",
        type: "recurring",
        amount: 1000,
        isPaused: false,
        isActive: true,
        isArchived: false,
      },
    });
    mockEscalationFindMany.mockResolvedValue([rule]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(1);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 1100 }, // 1000 * 1.10
    });
  });

  it("applies past-date one-off fixed_increase rule", async () => {
    const rule = makeEscalationWithObligation({
      changeType: "fixed_increase",
      value: 50,
      effectiveDate: new Date("2026-04-01"),
      obligation: {
        id: "obl-1",
        userId: "user-1",
        name: "Rent",
        type: "recurring",
        amount: 2000,
        isPaused: false,
        isActive: true,
        isArchived: false,
      },
    });
    mockEscalationFindMany.mockResolvedValue([rule]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(1);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 2050 }, // 2000 + 50
    });
  });

  it("skips future-date rules (handled by query filter)", async () => {
    // The Prisma query filters by effectiveDate <= now,
    // so future rules won't be returned
    mockEscalationFindMany.mockResolvedValue([]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(0);
    expect(result.updatedObligationIds).toEqual([]);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("skips paused obligations (handled by query filter)", async () => {
    // The Prisma query filters by isPaused: false,
    // so paused obligation rules won't be returned
    mockEscalationFindMany.mockResolvedValue([]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(0);
    expect(result.updatedObligationIds).toEqual([]);
  });

  it("skips already-applied rules (handled by query filter)", async () => {
    // The Prisma query filters by isApplied: false,
    // so already-applied rules won't be returned
    mockEscalationFindMany.mockResolvedValue([]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(0);
  });

  it("verifies the correct query filters are used", async () => {
    mockEscalationFindMany.mockResolvedValue([]);

    await applyPendingEscalations("user-1", NOW);

    expect(mockEscalationFindMany).toHaveBeenCalledWith({
      where: {
        isApplied: false,
        intervalMonths: null,
        effectiveDate: { lte: NOW },
        obligation: {
          userId: "user-1",
          isActive: true,
          isPaused: false,
        },
      },
      include: {
        obligation: true,
      },
      orderBy: { effectiveDate: "asc" },
    });
  });

  it("applies multiple rules for different obligations", async () => {
    const rule1 = makeEscalationWithObligation({
      id: "esc-1",
      obligationId: "obl-1",
      changeType: "absolute",
      value: 2200,
    });
    const rule2 = makeEscalationWithObligation({
      id: "esc-2",
      obligationId: "obl-2",
      changeType: "fixed_increase",
      value: 100,
      obligation: {
        id: "obl-2",
        userId: "user-1",
        name: "Insurance",
        type: "recurring",
        amount: 500,
        isPaused: false,
        isActive: true,
        isArchived: false,
      },
    });
    mockEscalationFindMany.mockResolvedValue([rule1, rule2]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(2);
    expect(result.updatedObligationIds).toEqual(["obl-1", "obl-2"]);
  });

  it("returns empty result when no pending rules exist", async () => {
    mockEscalationFindMany.mockResolvedValue([]);

    const result = await applyPendingEscalations("user-1", NOW);

    expect(result.appliedCount).toBe(0);
    expect(result.updatedObligationIds).toEqual([]);
  });
});

describe("applyDeferredEscalations", () => {
  it("applies deferred rules on resume (past-date rules for a specific obligation)", async () => {
    const rule = makeEscalationWithObligation({
      changeType: "absolute",
      value: 2500,
      effectiveDate: new Date("2026-03-01"),
    });
    mockEscalationFindMany.mockResolvedValue([rule]);

    const result = await applyDeferredEscalations("obl-1", NOW);

    expect(result.appliedCount).toBe(1);
    expect(result.updatedObligationIds).toEqual(["obl-1"]);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 2500 },
    });
    expect(mockEscalationUpdate).toHaveBeenCalledWith({
      where: { id: "esc-1" },
      data: {
        isApplied: true,
        appliedAt: NOW,
      },
    });
  });

  it("applies multiple deferred rules sequentially", async () => {
    const rule1 = makeEscalationWithObligation({
      id: "esc-1",
      changeType: "fixed_increase",
      value: 100,
      effectiveDate: new Date("2026-03-01"),
      obligation: {
        id: "obl-1",
        userId: "user-1",
        name: "Rent",
        type: "recurring",
        amount: 2000,
        isPaused: false,
        isActive: true,
        isArchived: false,
      },
    });
    const rule2 = makeEscalationWithObligation({
      id: "esc-2",
      changeType: "fixed_increase",
      value: 50,
      effectiveDate: new Date("2026-05-01"),
      obligation: {
        id: "obl-1",
        userId: "user-1",
        name: "Rent",
        type: "recurring",
        amount: 2000,
        isPaused: false,
        isActive: true,
        isArchived: false,
      },
    });
    mockEscalationFindMany.mockResolvedValue([rule1, rule2]);

    const result = await applyDeferredEscalations("obl-1", NOW);

    expect(result.appliedCount).toBe(2);

    // First rule: 2000 + 100 = 2100
    expect(mockObligationUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "obl-1" },
      data: { amount: 2100 },
    });
    // Second rule: 2100 + 50 = 2150
    expect(mockObligationUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "obl-1" },
      data: { amount: 2150 },
    });
  });

  it("queries for the correct obligation with proper filters", async () => {
    mockEscalationFindMany.mockResolvedValue([]);

    await applyDeferredEscalations("obl-1", NOW);

    expect(mockEscalationFindMany).toHaveBeenCalledWith({
      where: {
        obligationId: "obl-1",
        isApplied: false,
        intervalMonths: null,
        effectiveDate: { lte: NOW },
      },
      include: {
        obligation: true,
      },
      orderBy: { effectiveDate: "asc" },
    });
  });

  it("returns empty result when no deferred rules exist", async () => {
    mockEscalationFindMany.mockResolvedValue([]);

    const result = await applyDeferredEscalations("obl-1", NOW);

    expect(result.appliedCount).toBe(0);
    expect(result.updatedObligationIds).toEqual([]);
  });
});
