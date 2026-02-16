import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockObligationCreate = vi.fn();
const mockObligationFindUnique = vi.fn();
const mockObligationFindMany = vi.fn();
const mockCustomScheduleEntryCreateMany = vi.fn();
const mockFundGroupFindUnique = vi.fn();
const mockFundGroupFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    obligation: {
      create: (...args: unknown[]) => mockObligationCreate(...args),
      findUnique: (...args: unknown[]) => mockObligationFindUnique(...args),
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    customScheduleEntry: {
      createMany: (...args: unknown[]) =>
        mockCustomScheduleEntryCreateMany(...args),
    },
    fundGroup: {
      findUnique: (...args: unknown[]) => mockFundGroupFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFundGroupFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { GET, POST } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/obligations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const recurringBody = {
  name: "Netflix",
  type: "recurring",
  amount: 22.99,
  intervalUnit: "month",
  intervalCount: 1,
  nextDueDate: "2026-03-01T00:00:00.000Z",
};

const recurringWithEndBody = {
  name: "Tax Repayment",
  type: "recurring_with_end",
  amount: 200,
  intervalUnit: "month",
  intervalCount: 1,
  endDate: "2028-01-01T00:00:00.000Z",
  nextDueDate: "2026-04-01T00:00:00.000Z",
};

const oneOffBody = {
  name: "Car Registration",
  type: "one_off",
  amount: 850,
  nextDueDate: "2026-07-15T00:00:00.000Z",
};

const customBody = {
  name: "Council Tax",
  type: "custom",
  amount: 1800,
  nextDueDate: "2026-09-15T00:00:00.000Z",
  customEntries: [
    { dueDate: "2026-09-15T00:00:00.000Z", amount: 180 },
    { dueDate: "2026-10-15T00:00:00.000Z", amount: 180 },
    { dueDate: "2026-11-15T00:00:00.000Z", amount: 180 },
  ],
};

function setupTransaction() {
  mockTransaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txClient = {
        obligation: {
          create: mockObligationCreate,
          findUnique: mockObligationFindUnique,
        },
        customScheduleEntry: {
          createMany: mockCustomScheduleEntryCreateMany,
        },
      };
      return fn(txClient);
    }
  );
}

describe("POST /api/obligations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
    mockFundGroupFindFirst.mockResolvedValue({
      id: "fg_default",
      userId: "user_1",
      name: "Default",
      isDefault: true,
      currentBalance: 0,
    });
  });

  it("returns 201 for a recurring obligation", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const createdRecord = {
      id: "obl_1",
      userId: "user_1",
      name: "Netflix",
      type: "recurring",
      amount: 22.99,
      intervalUnit: "month",
      intervalCount: 1,
      endDate: null,
      nextDueDate: new Date("2026-03-01T00:00:00.000Z"),
      isPaused: false,
      isActive: true,
      isArchived: false,
      fundGroupId: "fg_default",
      customEntries: [],
    };
    mockObligationCreate.mockResolvedValue(createdRecord);
    mockObligationFindUnique.mockResolvedValue(createdRecord);

    const res = await POST(makeRequest(recurringBody));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Netflix");
    expect(data.type).toBe("recurring");

    expect(mockObligationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        name: "Netflix",
        type: "recurring",
        amount: 22.99,
        intervalUnit: "month",
        intervalCount: 1,
        fundGroupId: "fg_default",
      }),
    });
  });

  it("returns 201 for a recurring_with_end obligation", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const createdRecord = {
      id: "obl_2",
      userId: "user_1",
      name: "Tax Repayment",
      type: "recurring_with_end",
      amount: 200,
      intervalUnit: "month",
      intervalCount: 1,
      customEntries: [],
    };
    mockObligationCreate.mockResolvedValue(createdRecord);
    mockObligationFindUnique.mockResolvedValue(createdRecord);

    const res = await POST(makeRequest(recurringWithEndBody));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.type).toBe("recurring_with_end");

    expect(mockObligationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "recurring_with_end",
        intervalUnit: "month",
        intervalCount: 1,
        endDate: new Date("2028-01-01T00:00:00.000Z"),
      }),
    });
  });

  it("returns 201 for a one_off obligation", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const createdRecord = {
      id: "obl_3",
      userId: "user_1",
      name: "Car Registration",
      type: "one_off",
      amount: 850,
      intervalUnit: null,
      intervalCount: 1,
      customEntries: [],
    };
    mockObligationCreate.mockResolvedValue(createdRecord);
    mockObligationFindUnique.mockResolvedValue(createdRecord);

    const res = await POST(makeRequest(oneOffBody));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.type).toBe("one_off");

    expect(mockObligationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "one_off",
        intervalUnit: null,
        intervalCount: 1,
      }),
    });
  });

  it("returns 201 for a custom obligation with schedule entries", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const createdRecord = {
      id: "obl_4",
      userId: "user_1",
      name: "Council Tax",
      type: "custom",
      amount: 1800,
      intervalUnit: null,
      intervalCount: 1,
      customEntries: [
        {
          id: "cse_1",
          obligationId: "obl_4",
          dueDate: new Date("2026-09-15T00:00:00.000Z"),
          amount: 180,
          isPaid: false,
        },
        {
          id: "cse_2",
          obligationId: "obl_4",
          dueDate: new Date("2026-10-15T00:00:00.000Z"),
          amount: 180,
          isPaid: false,
        },
        {
          id: "cse_3",
          obligationId: "obl_4",
          dueDate: new Date("2026-11-15T00:00:00.000Z"),
          amount: 180,
          isPaid: false,
        },
      ],
    };
    mockObligationCreate.mockResolvedValue({ id: "obl_4" });
    mockObligationFindUnique.mockResolvedValue(createdRecord);

    const res = await POST(makeRequest(customBody));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.type).toBe("custom");
    expect(data.customEntries).toHaveLength(3);

    expect(mockCustomScheduleEntryCreateMany).toHaveBeenCalledWith({
      data: [
        {
          obligationId: "obl_4",
          dueDate: new Date("2026-09-15T00:00:00.000Z"),
          amount: 180,
        },
        {
          obligationId: "obl_4",
          dueDate: new Date("2026-10-15T00:00:00.000Z"),
          amount: 180,
        },
        {
          obligationId: "obl_4",
          dueDate: new Date("2026-11-15T00:00:00.000Z"),
          amount: 180,
        },
      ],
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest(recurringBody));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        type: "recurring",
        amount: 22.99,
        intervalUnit: "month",
        intervalCount: 1,
        nextDueDate: "2026-03-01T00:00:00.000Z",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
  });

  it("returns 400 when name is empty string", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        name: "  ",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
  });

  it("returns 400 when type is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        type: "invalid_type",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("type must be one of");
  });

  it("returns 400 when amount is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        name: recurringBody.name,
        type: recurringBody.type,
        intervalUnit: recurringBody.intervalUnit,
        intervalCount: recurringBody.intervalCount,
        nextDueDate: recurringBody.nextDueDate,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("amount must be a non-negative number");
  });

  it("returns 400 when amount is negative", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        amount: -10,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("amount must be a non-negative number");
  });

  it("returns 400 when intervalUnit is missing for recurring type", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        name: recurringBody.name,
        type: recurringBody.type,
        amount: recurringBody.amount,
        nextDueDate: recurringBody.nextDueDate,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("intervalUnit is required for recurring");
  });

  it("returns 400 when intervalUnit is invalid for recurring type", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        intervalUnit: "biweekly",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("intervalUnit is required for recurring");
  });

  it("returns 400 when intervalCount is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        intervalCount: -1,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("intervalCount must be a positive integer");
  });

  it("returns 400 when nextDueDate is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        name: recurringBody.name,
        type: recurringBody.type,
        amount: recurringBody.amount,
        intervalUnit: recurringBody.intervalUnit,
        intervalCount: recurringBody.intervalCount,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("nextDueDate is required");
  });

  it("returns 400 when endDate is missing for recurring_with_end", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        name: recurringWithEndBody.name,
        type: recurringWithEndBody.type,
        amount: recurringWithEndBody.amount,
        intervalUnit: recurringWithEndBody.intervalUnit,
        intervalCount: recurringWithEndBody.intervalCount,
        nextDueDate: recurringWithEndBody.nextDueDate,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe(
      "endDate is required for recurring_with_end obligations"
    );
  });

  it("returns 400 when customEntries is missing for custom type", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        name: customBody.name,
        type: customBody.type,
        amount: customBody.amount,
        nextDueDate: customBody.nextDueDate,
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("customEntries is required");
  });

  it("returns 400 when customEntries is empty for custom type", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...customBody,
        customEntries: [],
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("customEntries is required");
  });

  it("returns 400 when a custom entry has invalid amount", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...customBody,
        customEntries: [
          { dueDate: "2026-09-15T00:00:00.000Z", amount: -5 },
        ],
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("customEntries[0].amount");
  });

  it("trims whitespace from name", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const createdRecord = { id: "obl_5", name: "Netflix", customEntries: [] };
    mockObligationCreate.mockResolvedValue(createdRecord);
    mockObligationFindUnique.mockResolvedValue(createdRecord);

    await POST(
      makeRequest({
        ...recurringBody,
        name: "  Netflix  ",
      })
    );

    expect(mockObligationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Netflix",
      }),
    });
  });

  it("validates fundGroupId belongs to the user", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockFundGroupFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_2",
      name: "Other User Group",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        fundGroupId: "fg_1",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("fund group not found");
  });

  it("accepts a valid fundGroupId", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockFundGroupFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_1",
      name: "My Group",
    });
    const createdRecord = {
      id: "obl_6",
      fundGroupId: "fg_1",
      customEntries: [],
    };
    mockObligationCreate.mockResolvedValue(createdRecord);
    mockObligationFindUnique.mockResolvedValue(createdRecord);

    const res = await POST(
      makeRequest({
        ...recurringBody,
        fundGroupId: "fg_1",
      })
    );

    expect(res.status).toBe(201);
    expect(mockObligationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fundGroupId: "fg_1",
      }),
    });
  });

  it("returns 400 when intervalUnit is invalid value", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(
      makeRequest({
        ...recurringBody,
        intervalUnit: "custom",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("intervalUnit is required for recurring");
  });
});

function makeGetRequest(queryString = ""): NextRequest {
  return new NextRequest(`http://localhost/api/obligations${queryString}`, {
    method: "GET",
  });
}

describe("GET /api/obligations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with user's active non-archived obligations ordered by nextDueDate", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const records = [
      {
        id: "obl_1",
        userId: "user_1",
        name: "Netflix",
        type: "recurring",
        amount: 22.99,
        nextDueDate: new Date("2026-03-01T00:00:00.000Z"),
        customEntries: [],
        fundGroup: null,
      },
      {
        id: "obl_2",
        userId: "user_1",
        name: "Car Registration",
        type: "one_off",
        amount: 850,
        nextDueDate: new Date("2026-07-15T00:00:00.000Z"),
        customEntries: [],
        fundGroup: null,
      },
    ];
    mockObligationFindMany.mockResolvedValue(records);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("Netflix");
    expect(data[1].name).toBe("Car Registration");

    expect(mockObligationFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        isActive: true,
        isArchived: false,
      },
      include: {
        customEntries: true,
        fundGroup: true,
      },
      orderBy: {
        nextDueDate: "asc",
      },
    });
  });

  it("returns archived obligations when archived=true query param is set", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const records = [
      {
        id: "obl_arch",
        userId: "user_1",
        name: "Old Subscription",
        type: "recurring",
        amount: 9.99,
        nextDueDate: new Date("2025-06-01T00:00:00.000Z"),
        customEntries: [],
        fundGroup: null,
      },
    ];
    mockObligationFindMany.mockResolvedValue(records);

    const res = await GET(makeGetRequest("?archived=true"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Old Subscription");

    expect(mockObligationFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        isActive: true,
        isArchived: true,
      },
      include: {
        customEntries: true,
        fundGroup: true,
      },
      orderBy: {
        nextDueDate: "asc",
      },
    });
  });

  it("includes custom schedule entries in response", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const records = [
      {
        id: "obl_3",
        userId: "user_1",
        name: "Council Tax",
        type: "custom",
        amount: 1800,
        nextDueDate: new Date("2026-09-15T00:00:00.000Z"),
        customEntries: [
          { id: "cse_1", obligationId: "obl_3", dueDate: new Date("2026-09-15T00:00:00.000Z"), amount: 180, isPaid: false },
          { id: "cse_2", obligationId: "obl_3", dueDate: new Date("2026-10-15T00:00:00.000Z"), amount: 180, isPaid: false },
        ],
        fundGroup: null,
      },
    ];
    mockObligationFindMany.mockResolvedValue(records);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].customEntries).toHaveLength(2);
  });

  it("includes fund group in response", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    const records = [
      {
        id: "obl_4",
        userId: "user_1",
        name: "Netflix",
        type: "recurring",
        amount: 22.99,
        nextDueDate: new Date("2026-03-01T00:00:00.000Z"),
        customEntries: [],
        fundGroup: { id: "fg_1", userId: "user_1", name: "Entertainment" },
      },
    ];
    mockObligationFindMany.mockResolvedValue(records);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].fundGroup).toEqual(
      expect.objectContaining({ id: "fg_1", name: "Entertainment" })
    );
  });

  it("returns empty array when user has no obligations", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user_2",
      email: "new@example.com",
    });
    mockObligationFindMany.mockResolvedValue([]);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);

    expect(mockObligationFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_2",
        isActive: true,
        isArchived: false,
      },
      include: {
        customEntries: true,
        fundGroup: true,
      },
      orderBy: {
        nextDueDate: "asc",
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockObligationFindMany).not.toHaveBeenCalled();
  });
});
