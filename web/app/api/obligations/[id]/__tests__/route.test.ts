import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindUnique = vi.fn();
const mockObligationUpdate = vi.fn();
const mockFundGroupFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findUnique: (...args: unknown[]) => mockObligationFindUnique(...args),
      update: (...args: unknown[]) => mockObligationUpdate(...args),
    },
    fundGroup: {
      findUnique: (...args: unknown[]) => mockFundGroupFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/obligations/obl_1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const existingObligation = {
  id: "obl_1",
  userId: "user_1",
  name: "Netflix",
  type: "recurring",
  amount: 22.99,
  frequency: "monthly",
  frequencyDays: null,
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: null,
  nextDueDate: new Date("2026-03-01T00:00:00.000Z"),
  isPaused: false,
  isActive: true,
  isArchived: false,
  fundGroupId: null,
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PUT /api/obligations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and updates the obligation", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    const updatedRecord = {
      ...existingObligation,
      amount: 25.99,
      customEntries: [],
      fundGroup: null,
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(makeRequest({ amount: 25.99 }), makeParams("obl_1"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.amount).toBe(25.99);

    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl_1" },
      data: { amount: 25.99 },
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });
  });

  it("returns 200 when updating name", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    const updatedRecord = {
      ...existingObligation,
      name: "Disney+",
      customEntries: [],
      fundGroup: null,
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(
      makeRequest({ name: "  Disney+  " }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl_1" },
      data: { name: "Disney+" },
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });
  });

  it("returns 200 when updating isPaused", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    const updatedRecord = {
      ...existingObligation,
      isPaused: true,
      customEntries: [],
      fundGroup: null,
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(
      makeRequest({ isPaused: true }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isPaused).toBe(true);
  });

  it("returns 200 when updating frequency", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    const updatedRecord = {
      ...existingObligation,
      frequency: "quarterly",
      customEntries: [],
      fundGroup: null,
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(
      makeRequest({ frequency: "quarterly" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl_1" },
      data: { frequency: "quarterly", frequencyDays: null },
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });
  });

  it("returns 200 when updating nextDueDate", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    const updatedRecord = {
      ...existingObligation,
      nextDueDate: new Date("2026-04-01T00:00:00.000Z"),
      customEntries: [],
      fundGroup: null,
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(
      makeRequest({ nextDueDate: "2026-04-01T00:00:00.000Z" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl_1" },
      data: { nextDueDate: new Date("2026-04-01T00:00:00.000Z") },
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });
  });

  it("returns 200 when assigning a fund group", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    mockFundGroupFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_1",
      name: "Entertainment",
    });
    const updatedRecord = {
      ...existingObligation,
      fundGroupId: "fg_1",
      customEntries: [],
      fundGroup: { id: "fg_1", userId: "user_1", name: "Entertainment" },
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(
      makeRequest({ fundGroupId: "fg_1" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fundGroupId).toBe("fg_1");
  });

  it("returns 200 when removing fund group (setting to null)", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const existingWithGroup = { ...existingObligation, fundGroupId: "fg_1" };
    mockObligationFindUnique.mockResolvedValue(existingWithGroup);
    const updatedRecord = {
      ...existingObligation,
      fundGroupId: null,
      customEntries: [],
      fundGroup: null,
    };
    mockObligationUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(
      makeRequest({ fundGroupId: null }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl_1" },
      data: { fundGroupId: null },
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(makeRequest({ amount: 25 }), makeParams("obl_1"));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockObligationFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when obligation does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(null);

    const res = await PUT(
      makeRequest({ amount: 25 }),
      makeParams("nonexistent")
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
  });

  it("returns 404 when obligation belongs to another user", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_2",
      email: "other@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);

    const res = await PUT(makeRequest({ amount: 25 }), makeParams("obl_1"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockObligationUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when obligation is inactive (soft-deleted)", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue({
      ...existingObligation,
      isActive: false,
    });

    const res = await PUT(makeRequest({ amount: 25 }), makeParams("obl_1"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
  });

  it("returns 400 when name is empty string", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);

    const res = await PUT(makeRequest({ name: "  " }), makeParams("obl_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name must be a non-empty string");
  });

  it("returns 400 when amount is negative", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);

    const res = await PUT(makeRequest({ amount: -10 }), makeParams("obl_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("amount must be a non-negative number");
  });

  it("returns 400 when frequency is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);

    const res = await PUT(
      makeRequest({ frequency: "biweekly" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("frequency must be one of");
  });

  it("returns 400 when nextDueDate is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);

    const res = await PUT(
      makeRequest({ nextDueDate: "not-a-date" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("nextDueDate must be a valid date");
  });

  it("returns 400 when fund group belongs to another user", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);
    mockFundGroupFindUnique.mockResolvedValue({
      id: "fg_2",
      userId: "user_2",
      name: "Other Group",
    });

    const res = await PUT(
      makeRequest({ fundGroupId: "fg_2" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("fund group not found");
  });

  it("returns 400 when isPaused is not a boolean", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockObligationFindUnique.mockResolvedValue(existingObligation);

    const res = await PUT(
      makeRequest({ isPaused: "yes" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("isPaused must be a boolean");
  });

  it("clears frequencyDays when switching from custom to non-custom frequency", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const customFreqObligation = {
      ...existingObligation,
      frequency: "custom",
      frequencyDays: 14,
    };
    mockObligationFindUnique.mockResolvedValue(customFreqObligation);
    mockObligationUpdate.mockResolvedValue({
      ...customFreqObligation,
      frequency: "monthly",
      frequencyDays: null,
      customEntries: [],
      fundGroup: null,
    });

    const res = await PUT(
      makeRequest({ frequency: "monthly" }),
      makeParams("obl_1")
    );

    expect(res.status).toBe(200);
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl_1" },
      data: { frequency: "monthly", frequencyDays: null },
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });
  });
});
