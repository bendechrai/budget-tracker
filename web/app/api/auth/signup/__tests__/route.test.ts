import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_password"),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user and returns 201 with valid data", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });

    const res = await POST(makeRequest({
      email: "Test@Example.com",
      password: "securepass123",
    }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ id: "user_1", email: "test@example.com" });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { email: "test@example.com", passwordHash: "hashed_password" },
    });
  });

  it("returns 409 for duplicate email", async () => {
    mockFindUnique.mockResolvedValue({ id: "existing", email: "test@example.com" });

    const res = await POST(makeRequest({
      email: "test@example.com",
      password: "securepass123",
    }));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("email already registered");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for short password", async () => {
    const res = await POST(makeRequest({
      email: "test@example.com",
      password: "short",
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("password must be at least 8 characters");
    expect(mockFindUnique).not.toHaveBeenCalled();
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

  it("returns 400 for invalid email format", async () => {
    const res = await POST(makeRequest({
      email: "not-an-email",
      password: "securepass123",
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid email format");
  });

  it("normalizes email to lowercase and trims whitespace", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "user_2",
      email: "user@example.com",
    });

    await POST(makeRequest({
      email: "  User@Example.COM  ",
      password: "securepass123",
    }));

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });
});
