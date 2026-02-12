// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

vi.mock("jose", async () => {
  const actual = await vi.importActual("jose");
  return actual;
});

const TEST_SECRET = "test-secret-at-least-32-chars-long!!";

async function createTestToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function makeRequest(path: string, cookie?: string): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", `session=${cookie}`);
  }
  return new NextRequest(url, { headers });
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  it("allows access to the landing page without a session", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows access to /login without a session", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/login");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows access to /signup without a session", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/signup");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows access to /api/auth/* routes without a session", async () => {
    const { middleware } = await import("../middleware");

    for (const path of [
      "/api/auth/signup",
      "/api/auth/login",
      "/api/auth/logout",
    ]) {
      const request = makeRequest(path);
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("redirects unauthenticated requests to protected routes to /login", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/dashboard");
  });

  it("preserves the intended destination in the redirect query param", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/income/new");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/income/new");
  });

  it("allows authenticated requests to protected routes", async () => {
    const { middleware } = await import("../middleware");
    const token = await createTestToken("user-123");
    const request = makeRequest("/dashboard", token);
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects when session cookie has an invalid token", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/dashboard", "invalid-token");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("redirects when SESSION_SECRET is not set", async () => {
    delete process.env.SESSION_SECRET;
    const { middleware } = await import("../middleware");
    const token = await createTestToken("user-123");
    const request = makeRequest("/dashboard", token);
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("redirects protected API routes without a session", async () => {
    const { middleware } = await import("../middleware");
    const request = makeRequest("/api/income-sources");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });
});
