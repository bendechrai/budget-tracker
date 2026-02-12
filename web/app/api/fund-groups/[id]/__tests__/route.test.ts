import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundGroup: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    obligation: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT, DELETE } from "../route";

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makePutRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/fund-groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/fund-groups/${id}`, {
    method: "DELETE",
  });
}

describe("PUT /api/fund-groups/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with renamed fund group", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_1",
      name: "Old Name",
    });
    const updatedRecord = {
      id: "fg_1",
      userId: "user_1",
      name: "New Name",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    mockUpdate.mockResolvedValue(updatedRecord);

    const res = await PUT(makePutRequest("fg_1", { name: "New Name" }), makeParams("fg_1"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(updatedRecord);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "fg_1" },
      data: { name: "New Name" },
    });
  });

  it("trims whitespace from name", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({ id: "fg_1", userId: "user_1", name: "Old" });
    mockUpdate.mockResolvedValue({ id: "fg_1", name: "Trimmed" });

    await PUT(makePutRequest("fg_1", { name: "  Trimmed  " }), makeParams("fg_1"));

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "fg_1" },
      data: { name: "Trimmed" },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(makePutRequest("fg_1", { name: "Test" }), makeParams("fg_1"));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when fund group does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(null);

    const res = await PUT(makePutRequest("fg_nonexistent", { name: "Test" }), makeParams("fg_nonexistent"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when fund group belongs to another user", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_2",
      name: "Other User's Group",
    });

    const res = await PUT(makePutRequest("fg_1", { name: "Hijacked" }), makeParams("fg_1"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({ id: "fg_1", userId: "user_1", name: "Old" });

    const res = await PUT(makePutRequest("fg_1", {}), makeParams("fg_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty string", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({ id: "fg_1", userId: "user_1", name: "Old" });

    const res = await PUT(makePutRequest("fg_1", { name: "  " }), makeParams("fg_1"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name is required");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/fund-groups/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and deletes fund group, unassigning obligations", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_1",
      name: "Bills",
    });
    mockUpdateMany.mockResolvedValue({ count: 2 });
    mockDelete.mockResolvedValue({ id: "fg_1" });

    const res = await DELETE(makeDeleteRequest("fg_1"), makeParams("fg_1"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { fundGroupId: "fg_1" },
      data: { fundGroupId: null },
    });

    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: "fg_1" },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await DELETE(makeDeleteRequest("fg_1"), makeParams("fg_1"));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when fund group does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(null);

    const res = await DELETE(makeDeleteRequest("fg_nonexistent"), makeParams("fg_nonexistent"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when fund group belongs to another user", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({
      id: "fg_1",
      userId: "user_2",
      name: "Other User's Group",
    });

    const res = await DELETE(makeDeleteRequest("fg_1"), makeParams("fg_1"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
