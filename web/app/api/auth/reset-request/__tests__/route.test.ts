import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    passwordResetToken: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/reset-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/reset-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and creates token for existing user", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockCreate.mockResolvedValue({
      id: "token_1",
      userId: "user_1",
      token: "abc123",
      expiresAt: new Date(),
    });

    const res = await POST(makeRequest({ email: "test@example.com" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe(
      "if an account with that email exists, a reset link has been sent"
    );

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("returns 200 for nonexistent email without creating token", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: "nobody@example.com" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe(
      "if an account with that email exists, a reset link has been sent"
    );

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "nobody@example.com" },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("email is required");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("normalizes email to lowercase and trims whitespace", async () => {
    mockFindUnique.mockResolvedValue(null);

    await POST(makeRequest({ email: "  User@Example.COM  " }));

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });

  it("creates token with expiration in the future", async () => {
    const beforeRequest = Date.now();

    mockFindUnique.mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
    });
    mockCreate.mockResolvedValue({
      id: "token_1",
      userId: "user_1",
      token: "abc123",
      expiresAt: new Date(),
    });

    await POST(makeRequest({ email: "test@example.com" }));

    const createCall = mockCreate.mock.calls[0][0];
    const expiresAt = createCall.data.expiresAt as Date;
    const expiresAtMs = expiresAt.getTime();

    // Token should expire at least 59 minutes from now (1 hour minus test execution time)
    expect(expiresAtMs).toBeGreaterThan(beforeRequest + 59 * 60 * 1000);
    // But no more than 61 minutes
    expect(expiresAtMs).toBeLessThan(beforeRequest + 61 * 60 * 1000);
  });
});
