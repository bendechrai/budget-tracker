import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

const mockUser = { id: "user_1", email: "test@example.com" };

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/ai/parse", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/ai/parse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest({ text: "add Netflix $22.99 monthly" }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when text is missing", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("text is required");
  });

  it("returns 400 when text is empty string", async () => {
    const res = await POST(makeRequest({ text: "   " }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("text is required");
  });

  it("returns create intent for expense input", async () => {
    const res = await POST(
      makeRequest({ text: "add Netflix $22.99 monthly" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("create");
    expect(data.intent.targetType).toBe("expense");
    expect(data.intent.obligationFields.name).toBe("Netflix");
    expect(data.intent.obligationFields.amount).toBe(22.99);
    expect(data.intent.obligationFields.frequency).toBe("monthly");
  });

  it("returns create intent for income input", async () => {
    const res = await POST(
      makeRequest({ text: "I get paid $3200 every two weeks" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("create");
    expect(data.intent.targetType).toBe("income");
    expect(data.intent.incomeFields.expectedAmount).toBe(3200);
    expect(data.intent.incomeFields.frequency).toBe("fortnightly");
  });

  it("returns edit intent for change input", async () => {
    const res = await POST(
      makeRequest({ text: "change gym to $60" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("edit");
    expect(data.intent.targetName).toBe("gym");
    expect(data.intent.changes.amount).toBe(60);
  });

  it("returns delete intent for delete input", async () => {
    const res = await POST(
      makeRequest({ text: "delete Spotify" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("delete");
    expect(data.intent.targetName).toBe("spotify");
  });

  it("returns query intent with answer for questions", async () => {
    const res = await POST(
      makeRequest({ text: "what's my biggest expense?" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("query");
    expect(data.intent.question).toBe("what's my biggest expense?");
    expect(data.answer).toBeDefined();
  });

  it("returns clarification for ambiguous input", async () => {
    const res = await POST(
      makeRequest({ text: "Netflix" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("clarification");
    expect(data.intent.message).toContain("Netflix");
  });

  it("returns unrecognized for irrelevant input", async () => {
    const res = await POST(
      makeRequest({ text: "hello world this is a long unrecognizable phrase that won't match" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("unrecognized");
    expect(data.intent.message).toContain("budgeting");
  });
});
