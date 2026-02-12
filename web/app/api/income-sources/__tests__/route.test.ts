import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incomeSource: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/income-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Salary",
  expectedAmount: 5000,
  frequency: "monthly",
  isIrregular: false,
  nextExpectedDate: "2026-03-01T00:00:00.000Z",
};

describe("POST /api/income-sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with created income source on valid request", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    const createdRecord = {
      id: "inc_1",
      userId: "user_1",
      name: "Salary",
      expectedAmount: 5000,
      frequency: "monthly",
      frequencyDays: null,
      isIrregular: false,
      minimumExpected: null,
      nextExpectedDate: "2026-03-01T00:00:00.000Z",
      isPaused: false,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockCreate.mockResolvedValue(createdRecord);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual(createdRecord);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        name: "Salary",
        expectedAmount: 5000,
        frequency: "monthly",
        frequencyDays: null,
        isIrregular: false,
        minimumExpected: null,
        nextExpectedDate: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
  });

  it("returns 201 with custom frequency and frequencyDays", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockCreate.mockResolvedValue({ id: "inc_2", frequency: "custom", frequencyDays: 10 });

    const res = await POST(makeRequest({
      name: "Side Gig",
      expectedAmount: 500,
      frequency: "custom",
      frequencyDays: 10,
      isIrregular: false,
    }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        frequency: "custom",
        frequencyDays: 10,
      }),
    });
  });

  it("returns 201 with irregular income and minimumExpected", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockCreate.mockResolvedValue({ id: "inc_3", isIrregular: true, minimumExpected: 200 });

    const res = await POST(makeRequest({
      name: "Freelance",
      expectedAmount: 1000,
      frequency: "irregular",
      isIrregular: true,
      minimumExpected: 200,
    }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isIrregular: true,
        minimumExpected: 200,
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      expectedAmount: 5000,
      frequency: "monthly",
      isIrregular: false,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
  });

  it("returns 400 when name is empty string", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      name: "  ",
      expectedAmount: 5000,
      frequency: "monthly",
      isIrregular: false,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
  });

  it("returns 400 when expectedAmount is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      name: "Salary",
      frequency: "monthly",
      isIrregular: false,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("expectedAmount must be a non-negative number");
  });

  it("returns 400 when expectedAmount is negative", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      name: "Salary",
      expectedAmount: -100,
      frequency: "monthly",
      isIrregular: false,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("expectedAmount must be a non-negative number");
  });

  it("returns 400 when frequency is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      name: "Salary",
      expectedAmount: 5000,
      frequency: "biweekly",
      isIrregular: false,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("frequency must be one of");
  });

  it("returns 400 when frequency is custom but frequencyDays is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      name: "Side Gig",
      expectedAmount: 500,
      frequency: "custom",
      isIrregular: false,
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("frequencyDays must be a positive integer when frequency is custom");
  });

  it("returns 400 when isIrregular is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({
      name: "Salary",
      expectedAmount: 5000,
      frequency: "monthly",
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("isIrregular is required and must be a boolean");
  });

  it("trims whitespace from name", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockCreate.mockResolvedValue({ id: "inc_4", name: "Salary" });

    await POST(makeRequest({
      ...validBody,
      name: "  Salary  ",
    }));

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Salary",
      }),
    });
  });
});
