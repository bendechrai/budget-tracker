import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockDestroySession = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  destroySession: (...args: unknown[]) => mockDestroySession(...args),
}));

const mockTransaction = vi.fn();
const mockUserDelete = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { DELETE } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/user/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  passwordHash: "hashed_password",
};

describe("DELETE /api/user/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes account with correct confirmation (200)", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockDestroySession.mockResolvedValue(undefined);

    // Mock the transaction to execute the callback
    mockTransaction.mockImplementation(async (callback: (tx: Record<string, Record<string, unknown>>) => Promise<void>) => {
      const tx = {
        suggestionTransaction: { deleteMany: mockDeleteMany },
        suggestion: { deleteMany: mockDeleteMany },
        engineSnapshot: { deleteMany: mockDeleteMany },
        aIInteractionLog: { deleteMany: mockDeleteMany },
        importLog: { deleteMany: mockDeleteMany },
        transaction: { deleteMany: mockDeleteMany },
        escalation: { deleteMany: mockDeleteMany },
        contributionRecord: { deleteMany: mockDeleteMany },
        fundBalance: { deleteMany: mockDeleteMany },
        customScheduleEntry: { deleteMany: mockDeleteMany },
        obligation: { deleteMany: mockDeleteMany },
        fundGroup: { deleteMany: mockDeleteMany },
        incomeSource: { deleteMany: mockDeleteMany },
        passwordResetToken: { deleteMany: mockDeleteMany },
        user: { delete: mockUserDelete },
      };
      mockDeleteMany.mockResolvedValue({ count: 0 });
      mockUserDelete.mockResolvedValue(mockUser);
      await callback(tx);
    });

    const res = await DELETE(makeRequest({ confirmation: "DELETE" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "user_1" } });
    expect(mockDestroySession).toHaveBeenCalled();
  });

  it("returns 400 with wrong confirmation", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await DELETE(makeRequest({ confirmation: "wrong" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("confirmation");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 with missing confirmation", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await DELETE(makeRequest({}));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("confirmation");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await DELETE(makeRequest({ confirmation: "DELETE" }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
