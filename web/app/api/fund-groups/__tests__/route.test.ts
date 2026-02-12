import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundGroup: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { GET, POST } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/fund-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/fund-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with created fund group on valid request", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    const createdRecord = {
      id: "fg_1",
      userId: "user_1",
      name: "Bills",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockCreate.mockResolvedValue(createdRecord);

    const res = await POST(makeRequest({ name: "Bills" }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual(createdRecord);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        name: "Bills",
      },
    });
  });

  it("trims whitespace from name", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockCreate.mockResolvedValue({ id: "fg_2", name: "Savings" });

    await POST(makeRequest({ name: "  Savings  " }));

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Savings",
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest({ name: "Bills" }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty string", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });

    const res = await POST(makeRequest({ name: "  " }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/fund-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with user's fund groups ordered by createdAt desc", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    const records = [
      { id: "fg_2", userId: "user_1", name: "Savings", createdAt: "2026-02-01T00:00:00.000Z" },
      { id: "fg_1", userId: "user_1", name: "Bills", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    mockFindMany.mockResolvedValue(records);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(records);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  });

  it("returns empty array when user has no fund groups", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_2", email: "new@example.com" });
    mockFindMany.mockResolvedValue([]);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_2",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
