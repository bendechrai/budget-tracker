import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockIncomeSourceFindMany = vi.fn().mockResolvedValue([]);
const mockObligationFindMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    incomeSource: {
      findMany: (...args: unknown[]) => mockIncomeSourceFindMany(...args),
    },
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
  },
}));

const mockParseNaturalLanguage = vi.fn();
vi.mock("@/lib/ai/nlParser", () => ({
  parseNaturalLanguage: (...args: unknown[]) => mockParseNaturalLanguage(...args),
  MissingApiKeyError: class MissingApiKeyError extends Error {
    constructor() {
      super("ANTHROPIC_API_KEY is not set");
      this.name = "MissingApiKeyError";
    }
  },
}));

import { POST } from "../route";
import { MissingApiKeyError } from "@/lib/ai/nlParser";

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
    mockParseNaturalLanguage.mockResolvedValue({
      type: "create",
      targetType: "expense",
      confidence: "high",
      obligationFields: {
        name: "Netflix",
        type: "recurring",
        amount: 22.99,
        frequency: "monthly",
      },
    });

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
    mockParseNaturalLanguage.mockResolvedValue({
      type: "create",
      targetType: "income",
      confidence: "high",
      incomeFields: {
        name: "Salary",
        expectedAmount: 3200,
        frequency: "fortnightly",
        isIrregular: false,
      },
    });

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
    mockParseNaturalLanguage.mockResolvedValue({
      type: "edit",
      targetType: "expense",
      targetName: "Gym",
      confidence: "high",
      changes: { amount: 60 },
    });

    const res = await POST(
      makeRequest({ text: "change gym to $60" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("edit");
    expect(data.intent.targetName).toBe("Gym");
    expect(data.intent.changes.amount).toBe(60);
  });

  it("returns delete intent for delete input", async () => {
    mockParseNaturalLanguage.mockResolvedValue({
      type: "delete",
      targetType: "expense",
      targetName: "Spotify",
      confidence: "high",
    });

    const res = await POST(
      makeRequest({ text: "delete Spotify" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("delete");
    expect(data.intent.targetName).toBe("Spotify");
  });

  it("returns query intent with answer for questions", async () => {
    mockParseNaturalLanguage.mockResolvedValue({
      type: "query",
      question: "what's my biggest expense?",
      answer: "Your biggest expense is Rent at $2,000/month.",
      confidence: "high",
    });

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
    mockParseNaturalLanguage.mockResolvedValue({
      type: "clarification",
      message: 'Would you like to add "Netflix" as a new expense or edit an existing one?',
      originalInput: "Netflix",
    });

    const res = await POST(
      makeRequest({ text: "Netflix" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("clarification");
    expect(data.intent.message).toContain("Netflix");
  });

  it("returns unrecognized for irrelevant input", async () => {
    mockParseNaturalLanguage.mockResolvedValue({
      type: "unrecognized",
      message: "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
      originalInput: "hello world",
    });

    const res = await POST(
      makeRequest({ text: "hello world this is a long unrecognizable phrase that won't match" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent.type).toBe("unrecognized");
    expect(data.intent.message).toContain("budgeting");
  });

  it("loads financial context and passes to parser", async () => {
    mockIncomeSourceFindMany.mockResolvedValue([
      { id: "inc_1", name: "Salary", expectedAmount: 5000, frequency: "monthly" },
    ]);
    mockObligationFindMany.mockResolvedValue([
      { id: "obl_1", name: "Rent", amount: 2000, frequency: "monthly", type: "recurring", nextDueDate: new Date("2025-03-01") },
    ]);
    mockParseNaturalLanguage.mockResolvedValue({
      type: "create",
      targetType: "expense",
      confidence: "high",
      obligationFields: { name: "Netflix", type: "recurring", amount: 22.99, frequency: "monthly" },
    });

    await POST(makeRequest({ text: "add Netflix $22.99 monthly" }));

    expect(mockParseNaturalLanguage).toHaveBeenCalledWith(
      "add Netflix $22.99 monthly",
      {
        incomeSources: [{ id: "inc_1", name: "Salary", expectedAmount: 5000, frequency: "monthly" }],
        obligations: [{ id: "obl_1", name: "Rent", amount: 2000, frequency: "monthly", type: "recurring", nextDueDate: "2025-03-01" }],
      }
    );
  });

  it("returns 503 when API key is missing", async () => {
    mockParseNaturalLanguage.mockRejectedValue(new MissingApiKeyError());

    const res = await POST(makeRequest({ text: "add Netflix $22.99 monthly" }));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("missing_api_key");
    expect(data.message).toContain("API key");
  });

  it("returns 500 when parser throws unexpected error", async () => {
    mockParseNaturalLanguage.mockRejectedValue(new Error("Something went wrong"));

    const res = await POST(makeRequest({ text: "add Netflix $22.99 monthly" }));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("internal server error");
  });
});
