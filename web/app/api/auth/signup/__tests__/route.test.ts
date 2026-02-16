import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockFundGroupCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_password"),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/send", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
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

function setupTransaction() {
  mockTransaction.mockImplementation(
    async (fn: (tx: Record<string, Record<string, (...args: unknown[]) => unknown>>) => Promise<unknown>) => {
      const txClient = {
        user: {
          create: (...args: unknown[]) => mockUserCreate(...args),
        },
        fundGroup: {
          create: (...args: unknown[]) => mockFundGroupCreate(...args),
        },
      };
      return fn(txClient);
    }
  );
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("creates a user and returns 201 with valid data", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      onboardingComplete: false,
    });
    mockFundGroupCreate.mockResolvedValue({
      id: "fg_1",
      userId: "user_1",
      name: "Default Sinking Fund",
      isDefault: true,
      currentBalance: 0,
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
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: { email: "test@example.com", passwordHash: "hashed_password" },
    });
    expect(mockFundGroupCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        name: "Default Sinking Fund",
        isDefault: true,
        currentBalance: 0,
      },
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
    expect(mockUserCreate).not.toHaveBeenCalled();
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
    mockUserCreate.mockResolvedValue({
      id: "user_2",
      email: "user@example.com",
      onboardingComplete: false,
    });
    mockFundGroupCreate.mockResolvedValue({
      id: "fg_2",
      userId: "user_2",
      name: "Default Sinking Fund",
      isDefault: true,
      currentBalance: 0,
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
