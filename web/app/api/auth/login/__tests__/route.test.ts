import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockVerifyPassword = vi.fn();

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";
import { createSession } from "@/lib/auth/session";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and creates session with valid credentials", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      passwordHash: "hashed_password",
    });
    mockVerifyPassword.mockResolvedValue(true);

    const res = await POST(makeRequest({
      email: "Test@Example.com",
      password: "securepass123",
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ id: "user_1", email: "test@example.com" });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
    expect(mockVerifyPassword).toHaveBeenCalledWith("securepass123", "hashed_password");
    expect(createSession).toHaveBeenCalledWith("user_1");
  });

  it("returns 401 for wrong password", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      passwordHash: "hashed_password",
    });
    mockVerifyPassword.mockResolvedValue(false);

    const res = await POST(makeRequest({
      email: "test@example.com",
      password: "wrongpassword",
    }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("invalid email or password");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns 401 for nonexistent email", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({
      email: "nonexistent@example.com",
      password: "securepass123",
    }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("invalid email or password");
    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ password: "securepass123" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("email and password are required");
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({ email: "test@example.com" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("email and password are required");
  });

  it("normalizes email to lowercase and trims whitespace", async () => {
    mockFindUnique.mockResolvedValue(null);

    await POST(makeRequest({
      email: "  User@Example.COM  ",
      password: "securepass123",
    }));

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });
});
