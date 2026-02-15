import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockVerifyPassword = vi.fn();
const mockHashPassword = vi.fn();

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
}));

const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { PUT } from "../route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/user/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockUser = {
  id: "user_1",
  email: "test@example.com",
  passwordHash: "hashed_old_password",
};

describe("PUT /api/user/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates password with correct current password (200)", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword
      .mockResolvedValueOnce(true)   // current password valid
      .mockResolvedValueOnce(false); // new password differs
    mockHashPassword.mockResolvedValue("hashed_new_password");
    mockUserUpdate.mockResolvedValue({ ...mockUser, passwordHash: "hashed_new_password" });

    const res = await PUT(
      makeRequest({ currentPassword: "oldpass123", newPassword: "newpass456" }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockHashPassword).toHaveBeenCalledWith("newpass456");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { passwordHash: "hashed_new_password" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(
      makeRequest({ currentPassword: "oldpass123", newPassword: "newpass456" }),
    );

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for wrong current password", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValueOnce(false);

    const res = await PUT(
      makeRequest({ currentPassword: "wrongpass", newPassword: "newpass456" }),
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("incorrect password");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for short new password", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await PUT(
      makeRequest({ currentPassword: "oldpass123", newPassword: "short" }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("new password must be at least 8 characters");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when new password is same as current", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockVerifyPassword
      .mockResolvedValueOnce(true)  // current password valid
      .mockResolvedValueOnce(true); // new password matches current

    const res = await PUT(
      makeRequest({ currentPassword: "samepass123", newPassword: "samepass123" }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("new password must differ from current password");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when currentPassword is missing", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await PUT(makeRequest({ newPassword: "newpass456" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("currentPassword is required");
  });

  it("returns 400 when newPassword is missing", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);

    const res = await PUT(makeRequest({ currentPassword: "oldpass123" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("newPassword is required");
  });
});
