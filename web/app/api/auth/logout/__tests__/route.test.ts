import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDestroySession = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  destroySession: (...args: unknown[]) => mockDestroySession(...args),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and destroys session", async () => {
    mockDestroySession.mockResolvedValue(undefined);

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true });
    expect(mockDestroySession).toHaveBeenCalledOnce();
  });

  it("returns 500 when session destruction fails", async () => {
    mockDestroySession.mockRejectedValue(new Error("cookie error"));

    const res = await POST();

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
