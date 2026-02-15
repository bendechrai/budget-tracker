// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

vi.mock("jose", async () => {
  const actual = await vi.importActual("jose");
  return actual;
});

const TEST_SECRET = "test-secret-at-least-32-chars-long!!";

async function createTestToken(
  userId: string,
  onboardingComplete: boolean = false
): Promise<string> {
  return new SignJWT({ userId, onboardingComplete })
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

describe("auth proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  it("allows access to the landing page without a session", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows access to /login without a session", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/login");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows access to /signup without a session", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/signup");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows access to /api/auth/* routes without a session", async () => {
    const { proxy } = await import("../proxy");

    for (const path of [
      "/api/auth/signup",
      "/api/auth/login",
      "/api/auth/logout",
    ]) {
      const request = makeRequest(path);
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("redirects unauthenticated requests to protected routes to /login", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/dashboard");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/dashboard");
  });

  it("preserves the intended destination in the redirect query param", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/income/new");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/income/new");
  });

  it("allows authenticated requests to protected routes", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", true);
    const request = makeRequest("/dashboard", token);
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects when session cookie has an invalid token", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/dashboard", "invalid-token");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("redirects when SESSION_SECRET is not set", async () => {
    delete process.env.SESSION_SECRET;
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123");
    const request = makeRequest("/dashboard", token);
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("redirects protected API routes without a session", async () => {
    const { proxy } = await import("../proxy");
    const request = makeRequest("/api/income-sources");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });
});

describe("onboarding redirect logic", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  it("redirects non-onboarded user from /dashboard to /onboarding", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", false);
    const request = makeRequest("/dashboard", token);
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/onboarding");
  });

  it("redirects non-onboarded user from any protected page to /onboarding", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", false);
    const request = makeRequest("/income", token);
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/onboarding");
  });

  it("allows non-onboarded user to access /onboarding", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", false);
    const request = makeRequest("/onboarding", token);
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows non-onboarded user to access /onboarding sub-routes", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", false);

    for (const path of [
      "/onboarding/manual/income",
      "/onboarding/manual/obligations",
      "/onboarding/fund-setup",
      "/onboarding/upload",
    ]) {
      const request = makeRequest(path, token);
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("allows non-onboarded user to access API routes", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", false);
    const request = makeRequest("/api/user/onboarding", token);
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects onboarded user from /onboarding to /dashboard", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", true);
    const request = makeRequest("/onboarding", token);
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/dashboard");
  });

  it("redirects onboarded user from /onboarding sub-routes to /dashboard", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", true);
    const request = makeRequest("/onboarding/manual/income", token);
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/dashboard");
  });

  it("allows onboarded user to access /dashboard", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", true);
    const request = makeRequest("/dashboard", token);
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows onboarded user to access API routes", async () => {
    const { proxy } = await import("../proxy");
    const token = await createTestToken("user-123", true);
    const request = makeRequest("/api/income-sources", token);
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
