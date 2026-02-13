import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationFindUnique = vi.fn();
const mockEscalationCreate = vi.fn();
const mockEscalationDeleteMany = vi.fn();
const mockObligationUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      findUnique: (...args: unknown[]) => mockObligationFindUnique(...args),
      update: (...args: unknown[]) => mockObligationUpdate(...args),
    },
    escalation: {
      create: (...args: unknown[]) => mockEscalationCreate(...args),
      deleteMany: (...args: unknown[]) => mockEscalationDeleteMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

const mockUser = { id: "user-1", email: "test@example.com" };

const baseObligation = {
  id: "obl-1",
  userId: "user-1",
  name: "Rent",
  type: "recurring",
  amount: 2000,
  isActive: true,
  isPaused: false,
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/escalations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupTransaction() {
  mockTransaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txClient = {
        escalation: {
          create: mockEscalationCreate,
          deleteMany: mockEscalationDeleteMany,
        },
        obligation: {
          update: mockObligationUpdate,
        },
      };
      return fn(txClient);
    }
  );
}

describe("POST /api/escalations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockObligationFindUnique.mockResolvedValue(baseObligation);
    setupTransaction();
  });

  it("creates a one-off absolute escalation (201)", async () => {
    const escalationResult = {
      id: "esc-1",
      obligationId: "obl-1",
      changeType: "absolute",
      value: 2200,
      effectiveDate: new Date("2026-07-01"),
      intervalMonths: null,
      isApplied: false,
      appliedAt: null,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2200,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.changeType).toBe("absolute");
    expect(data.intervalMonths).toBeNull();
    expect(mockEscalationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2200,
        intervalMonths: null,
        isApplied: false,
        appliedAt: null,
      }),
    });
  });

  it("creates a recurring percentage escalation (201)", async () => {
    const escalationResult = {
      id: "esc-2",
      obligationId: "obl-1",
      changeType: "percentage",
      value: 3,
      effectiveDate: new Date("2026-07-01"),
      intervalMonths: 12,
      isApplied: false,
      appliedAt: null,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "percentage",
        value: 3,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: 12,
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.changeType).toBe("percentage");
    expect(data.intervalMonths).toBe(12);
    // Should delete existing recurring rules before creating new one
    expect(mockEscalationDeleteMany).toHaveBeenCalledWith({
      where: {
        obligationId: "obl-1",
        intervalMonths: { not: null },
      },
    });
  });

  it("rejects absolute changeType with recurring interval (400)", async () => {
    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2200,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: 12,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("absolute");
  });

  it("rejects escalation for one-off obligation (400)", async () => {
    mockObligationFindUnique.mockResolvedValue({
      ...baseObligation,
      type: "one_off",
    });

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "percentage",
        value: 5,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("one-off");
  });

  it("auto-applies past-date one-off rule", async () => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z");
    const escalationResult = {
      id: "esc-3",
      obligationId: "obl-1",
      changeType: "fixed_increase",
      value: 50,
      effectiveDate: pastDate,
      intervalMonths: null,
      isApplied: true,
      appliedAt: expect.any(Date),
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "fixed_increase",
        value: 50,
        effectiveDate: "2020-01-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    // Should create escalation with isApplied=true
    expect(mockEscalationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isApplied: true,
      }),
    });
    // Should update obligation amount (2000 + 50 = 2050)
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 2050 },
    });
  });

  it("auto-applies past-date one-off percentage rule with correct calculation", async () => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z");
    const escalationResult = {
      id: "esc-4",
      obligationId: "obl-1",
      changeType: "percentage",
      value: 10,
      effectiveDate: pastDate,
      intervalMonths: null,
      isApplied: true,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "percentage",
        value: 10,
        effectiveDate: "2020-01-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    // 2000 * 1.1 = 2200
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 2200 },
    });
  });

  it("auto-applies past-date one-off absolute rule with correct calculation", async () => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z");
    const escalationResult = {
      id: "esc-5",
      obligationId: "obl-1",
      changeType: "absolute",
      value: 2500,
      effectiveDate: pastDate,
      intervalMonths: null,
      isApplied: true,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2500,
        effectiveDate: "2020-01-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    // absolute: set to 2500
    expect(mockObligationUpdate).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { amount: 2500 },
    });
  });

  it("does not auto-apply past-date one-off for paused obligation", async () => {
    mockObligationFindUnique.mockResolvedValue({
      ...baseObligation,
      isPaused: true,
    });
    const escalationResult = {
      id: "esc-6",
      obligationId: "obl-1",
      changeType: "fixed_increase",
      value: 50,
      effectiveDate: new Date("2020-01-01"),
      intervalMonths: null,
      isApplied: false,
      appliedAt: null,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "fixed_increase",
        value: 50,
        effectiveDate: "2020-01-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    // Should NOT auto-apply because obligation is paused
    expect(mockEscalationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isApplied: false,
        appliedAt: null,
      }),
    });
    expect(mockObligationUpdate).not.toHaveBeenCalled();
  });

  it("replaces existing recurring rule when creating a new one", async () => {
    const escalationResult = {
      id: "esc-7",
      obligationId: "obl-1",
      changeType: "fixed_increase",
      value: 50,
      effectiveDate: new Date("2026-07-01"),
      intervalMonths: 12,
      isApplied: false,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "fixed_increase",
        value: 50,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: 12,
      })
    );

    expect(res.status).toBe(201);
    expect(mockEscalationDeleteMany).toHaveBeenCalledWith({
      where: {
        obligationId: "obl-1",
        intervalMonths: { not: null },
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2200,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 for another user's obligation", async () => {
    mockObligationFindUnique.mockResolvedValue({
      ...baseObligation,
      userId: "other-user",
    });

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2200,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 for missing obligationId", async () => {
    const res = await POST(
      makeRequest({
        changeType: "absolute",
        value: 2200,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("obligationId");
  });

  it("returns 400 for invalid changeType", async () => {
    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "invalid",
        value: 2200,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("changeType");
  });

  it("returns 400 for missing value", async () => {
    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("value");
  });

  it("returns 400 for missing effectiveDate", async () => {
    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "absolute",
        value: 2200,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("effectiveDate");
  });

  it("returns 400 for invalid intervalMonths", async () => {
    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "percentage",
        value: 3,
        effectiveDate: "2026-07-01T00:00:00.000Z",
        intervalMonths: -1,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("intervalMonths");
  });

  it("includes warning for >50% percentage increase", async () => {
    const escalationResult = {
      id: "esc-warn-1",
      obligationId: "obl-1",
      changeType: "percentage",
      value: 60,
      effectiveDate: new Date("2026-07-01"),
      intervalMonths: null,
      isApplied: false,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "percentage",
        value: 60,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.warning).toContain("50%");
  });

  it("includes warning for fixed_increase >50% of current amount", async () => {
    const escalationResult = {
      id: "esc-warn-2",
      obligationId: "obl-1",
      changeType: "fixed_increase",
      value: 1500,
      effectiveDate: new Date("2026-07-01"),
      intervalMonths: null,
      isApplied: false,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "fixed_increase",
        value: 1500,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.warning).toContain("50%");
  });

  it("does not include warning for reasonable increases", async () => {
    const escalationResult = {
      id: "esc-no-warn",
      obligationId: "obl-1",
      changeType: "percentage",
      value: 3,
      effectiveDate: new Date("2026-07-01"),
      intervalMonths: null,
      isApplied: false,
    };
    mockEscalationCreate.mockResolvedValue(escalationResult);

    const res = await POST(
      makeRequest({
        obligationId: "obl-1",
        changeType: "percentage",
        value: 3,
        effectiveDate: "2026-07-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.warning).toBeUndefined();
  });
});
