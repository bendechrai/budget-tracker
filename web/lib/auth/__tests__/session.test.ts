// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionToken, verifySessionToken } from "../session";

// Mock next/headers — not needed for token-level tests, but required to avoid import errors
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-chars-long!!";
});

describe("session token management", () => {
  it("creates a token and verifies it back to the original payload", async () => {
    const payload = { userId: "user-123" };

    const token = await createSessionToken(payload);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const parsed = await verifySessionToken(token);
    expect(parsed).toEqual({ userId: "user-123" });
  });

  it("returns null for an invalid token", async () => {
    const parsed = await verifySessionToken("not-a-valid-token");
    expect(parsed).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const token = await createSessionToken({ userId: "user-123" });
    const tampered = token.slice(0, -5) + "XXXXX";

    const parsed = await verifySessionToken(tampered);
    expect(parsed).toBeNull();
  });

  it("returns null when token was signed with a different secret", async () => {
    const token = await createSessionToken({ userId: "user-123" });

    // Change the secret
    process.env.SESSION_SECRET = "different-secret-at-least-32-chars!!";

    const parsed = await verifySessionToken(token);
    expect(parsed).toBeNull();
  });

  it("throws if SESSION_SECRET is not set", async () => {
    delete process.env.SESSION_SECRET;

    await expect(
      createSessionToken({ userId: "user-123" })
    ).rejects.toThrow("SESSION_SECRET environment variable is not set");
  });
});
