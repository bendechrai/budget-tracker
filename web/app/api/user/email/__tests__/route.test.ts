import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockVerifyPassword = vi.fn();

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/user/email", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockUser = {
  id: "user_1",
  email: "old@example.com",
  passwordHash: "hashed_password",
};

describe("PUT /api/user/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates email with correct password (200)", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockUserFindUnique.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({ ...mockUser, email: "new@example.com" });

    const res = await PUT(
      makeRequest({ newEmail: "new@example.com", currentPassword: "password123" }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe("new@example.com");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { email: "new@example.com" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(
      makeRequest({ newEmail: "new@example.com", currentPassword: "password123" }),
    );

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for wrong password", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(false);

    const res = await PUT(
      makeRequest({ newEmail: "new@example.com", currentPassword: "wrong" }),
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("incorrect password");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 for duplicate email", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockUserFindUnique.mockResolvedValue({ id: "user_2", email: "taken@example.com" });

    const res = await PUT(
      makeRequest({ newEmail: "taken@example.com", currentPassword: "password123" }),
    );

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("email already in use");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email format", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);

    const res = await PUT(
      makeRequest({ newEmail: "not-an-email", currentPassword: "password123" }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid email format");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when newEmail is missing", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await PUT(makeRequest({ currentPassword: "password123" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("newEmail is required");
  });

  it("returns 400 when currentPassword is missing", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await PUT(makeRequest({ newEmail: "new@example.com" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("currentPassword is required");
  });

  it("normalizes email to lowercase", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockUserFindUnique.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({ ...mockUser, email: "new@example.com" });

    const res = await PUT(
      makeRequest({ newEmail: "New@Example.COM", currentPassword: "password123" }),
    );

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { email: "new@example.com" },
    });
  });

  it("returns 400 when new email matches current email", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);

    const res = await PUT(
      makeRequest({ newEmail: "old@example.com", currentPassword: "password123" }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("new email must differ from current email");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
