import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockTokenUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockTokenUpdate(...args),
    },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_new_password"),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/reset-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/reset-confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockResolvedValue([]);
  });

  it("returns 200 and resets password for valid token", async () => {
    mockFindUnique.mockResolvedValue({
      id: "token_1",
      userId: "user_1",
      token: "valid_token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
    });

    const res = await POST(
      makeRequest({ token: "valid_token", password: "newpassword123" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("password has been reset");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { token: "valid_token" },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for expired token", async () => {
    mockFindUnique.mockResolvedValue({
      id: "token_1",
      userId: "user_1",
      token: "expired_token",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      usedAt: null,
    });

    const res = await POST(
      makeRequest({ token: "expired_token", password: "newpassword123" })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid or expired reset token");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for already-used token", async () => {
    mockFindUnique.mockResolvedValue({
      id: "token_1",
      userId: "user_1",
      token: "used_token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const res = await POST(
      makeRequest({ token: "used_token", password: "newpassword123" })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("reset token has already been used");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for nonexistent token", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ token: "nonexistent_token", password: "newpassword123" })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid or expired reset token");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when token is missing", async () => {
    const res = await POST(makeRequest({ password: "newpassword123" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("token and password are required");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({ token: "valid_token" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("token and password are required");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when password is too short", async () => {
    const res = await POST(
      makeRequest({ token: "valid_token", password: "short" })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("password must be at least 8 characters");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
