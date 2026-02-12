import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incomeSource: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT, DELETE } from "../route";

function makeRequest(id: string, body: Record<string, unknown>): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/income-sources/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

const existingRecord = {
  id: "inc_1",
  userId: "user_1",
  name: "Salary",
  expectedAmount: 5000,
  frequency: "monthly",
  frequencyDays: null,
  isIrregular: false,
  minimumExpected: null,
  nextExpectedDate: null,
  isPaused: false,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("PUT /api/income-sources/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with updated income source on valid request", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);
    const updatedRecord = { ...existingRecord, name: "Updated Salary", expectedAmount: 6000 };
    mockUpdate.mockResolvedValue(updatedRecord);

    const [req, ctx] = makeRequest("inc_1", { name: "Updated Salary", expectedAmount: 6000 });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated Salary");
    expect(data.expectedAmount).toBe(6000);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: {
        name: "Updated Salary",
        expectedAmount: 6000,
      },
    });
  });

  it("returns 200 when updating isPaused", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);
    const updatedRecord = { ...existingRecord, isPaused: true };
    mockUpdate.mockResolvedValue(updatedRecord);

    const [req, ctx] = makeRequest("inc_1", { isPaused: true });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isPaused).toBe(true);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: {
        isPaused: true,
      },
    });
  });

  it("returns 200 when updating frequency to custom with frequencyDays", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);
    const updatedRecord = { ...existingRecord, frequency: "custom", frequencyDays: 14 };
    mockUpdate.mockResolvedValue(updatedRecord);

    const [req, ctx] = makeRequest("inc_1", { frequency: "custom", frequencyDays: 14 });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: {
        frequency: "custom",
        frequencyDays: 14,
      },
    });
  });

  it("clears frequencyDays when changing from custom to non-custom frequency", async () => {
    const customRecord = { ...existingRecord, frequency: "custom", frequencyDays: 14 };
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(customRecord);
    mockUpdate.mockResolvedValue({ ...customRecord, frequency: "monthly", frequencyDays: null });

    const [req, ctx] = makeRequest("inc_1", { frequency: "monthly" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: {
        frequency: "monthly",
        frequencyDays: null,
      },
    });
  });

  it("trims whitespace from name", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);
    mockUpdate.mockResolvedValue({ ...existingRecord, name: "New Name" });

    const [req, ctx] = makeRequest("inc_1", { name: "  New Name  " });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: {
        name: "New Name",
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const [req, ctx] = makeRequest("inc_1", { name: "Updated" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when income source does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(null);

    const [req, ctx] = makeRequest("nonexistent", { name: "Updated" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when trying to update another user's income source", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_2", email: "other@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);

    const [req, ctx] = makeRequest("inc_1", { name: "Hijacked" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when income source is soft-deleted (isActive=false)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({ ...existingRecord, isActive: false });

    const [req, ctx] = makeRequest("inc_1", { name: "Updated" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty string", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);

    const [req, ctx] = makeRequest("inc_1", { name: "  " });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("name must be a non-empty string");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when expectedAmount is negative", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);

    const [req, ctx] = makeRequest("inc_1", { expectedAmount: -100 });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("expectedAmount must be a non-negative number");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when frequency is invalid", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);

    const [req, ctx] = makeRequest("inc_1", { frequency: "biweekly" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("frequency must be one of");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when changing to custom frequency without frequencyDays", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);

    const [req, ctx] = makeRequest("inc_1", { frequency: "custom" });
    const res = await PUT(req, ctx);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("frequencyDays must be a positive integer when frequency is custom");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

function makeDeleteRequest(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/income-sources/${id}`, {
    method: "DELETE",
  });
  return [req, { params: Promise.resolve({ id }) }];
}

describe("DELETE /api/income-sources/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and soft-deletes the income source", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);
    mockUpdate.mockResolvedValue({ ...existingRecord, isActive: false });

    const [req, ctx] = makeDeleteRequest("inc_1");
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: { isActive: false },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const [req, ctx] = makeDeleteRequest("inc_1");
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when income source does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue(null);

    const [req, ctx] = makeDeleteRequest("nonexistent");
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when trying to delete another user's income source", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_2", email: "other@example.com" });
    mockFindUnique.mockResolvedValue(existingRecord);

    const [req, ctx] = makeDeleteRequest("inc_1");
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when income source is already soft-deleted", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindUnique.mockResolvedValue({ ...existingRecord, isActive: false });

    const [req, ctx] = makeDeleteRequest("inc_1");
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
