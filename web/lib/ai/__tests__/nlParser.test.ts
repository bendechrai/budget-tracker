import { describe, it, expect, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { FinancialContext } from "../types";
import type {
  CreateIntent,
  EditIntent,
  DeleteIntent,
  QueryIntent,
  WhatIfIntent,
  EscalationIntent,
  ClarificationResult,
  UnrecognizedResult,
} from "../types";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { parseNaturalLanguage, MissingApiKeyError } from "../nlParser";

const emptyContext: FinancialContext = {
  incomeSources: [],
  obligations: [],
};

const sampleContext: FinancialContext = {
  incomeSources: [
    { id: "inc_1", name: "Salary", expectedAmount: 5000, frequency: "monthly" },
  ],
  obligations: [
    { id: "obl_1", name: "Netflix", amount: 22.99, frequency: "monthly", type: "recurring", nextDueDate: "2025-04-01" },
    { id: "obl_2", name: "Gym Membership", amount: 50, frequency: "monthly", type: "recurring", nextDueDate: "2025-03-15" },
    { id: "obl_3", name: "Rent", amount: 2000, frequency: "monthly", type: "recurring", nextDueDate: "2025-03-01" },
  ],
};

/** Create a mock Anthropic client that returns a specific JSON response. */
function mockClient(json: Record<string, unknown>): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify(json) }],
      }),
    },
  } as unknown as Anthropic;
}

/** Create a mock client that returns raw text (non-JSON). */
function mockClientText(text: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as Anthropic;
}

/** Create a mock client that rejects with an error. */
function mockClientError(error: Error): Anthropic {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(error),
    },
  } as unknown as Anthropic;
}

describe("parseNaturalLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  describe("create intents", () => {
    it('parses "Add an income of $1000 a month" with a sensible name', async () => {
      const client = mockClient({
        type: "create",
        targetType: "income",
        confidence: "high",
        incomeFields: {
          name: "Monthly Income",
          expectedAmount: 1000,
          frequency: "monthly",
          isIrregular: false,
        },
      });

      const result = await parseNaturalLanguage(
        "Add an income of $1000 a month",
        emptyContext,
        client
      );
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
      expect(create.incomeFields?.name).not.toBe("Add");
      expect(create.incomeFields?.name).toBeTruthy();
      expect(create.incomeFields?.expectedAmount).toBe(1000);
      expect(create.incomeFields?.frequency).toBe("monthly");
    });

    it('parses "Netflix $22.99 monthly" as create expense', async () => {
      const client = mockClient({
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

      const result = await parseNaturalLanguage(
        "Netflix $22.99 monthly",
        emptyContext,
        client
      );
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("expense");
      expect(create.obligationFields?.name).toBe("Netflix");
      expect(create.obligationFields?.amount).toBe(22.99);
      expect(create.obligationFields?.frequency).toBe("monthly");
    });

    it('parses "add salary $5000 monthly" as create income', async () => {
      const client = mockClient({
        type: "create",
        targetType: "income",
        confidence: "high",
        incomeFields: {
          name: "Salary",
          expectedAmount: 5000,
          frequency: "monthly",
          isIrregular: false,
        },
      });

      const result = await parseNaturalLanguage(
        "add salary $5000 monthly",
        emptyContext,
        client
      );
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
      expect(create.incomeFields?.expectedAmount).toBe(5000);
    });
  });

  describe("edit intents", () => {
    it('parses "change gym to $60" as edit', async () => {
      const client = mockClient({
        type: "edit",
        targetType: "expense",
        targetName: "Gym Membership",
        confidence: "high",
        changes: { amount: 60 },
      });

      const result = await parseNaturalLanguage(
        "change gym to $60",
        sampleContext,
        client
      );
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toBe("Gym Membership");
      expect(edit.changes.amount).toBe(60);
      expect(edit.confidence).toBe("high");
    });

    it('parses "change the gym membership to $60" resolving against user data', async () => {
      const client = mockClient({
        type: "edit",
        targetType: "expense",
        targetName: "Gym Membership",
        confidence: "high",
        changes: { amount: 60 },
      });

      const result = await parseNaturalLanguage(
        "change the gym membership to $60",
        sampleContext,
        client
      );
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toBe("Gym Membership");
      expect(edit.changes.amount).toBe(60);
    });
  });

  describe("delete intents", () => {
    it('parses "delete Spotify" as delete', async () => {
      const client = mockClient({
        type: "delete",
        targetType: "expense",
        targetName: "Spotify",
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "delete Spotify",
        emptyContext,
        client
      );
      expect(result.type).toBe("delete");
      const del = result as DeleteIntent;
      expect(del.targetName).toBe("Spotify");
      expect(del.confidence).toBe("high");
    });

    it('parses "cancel Netflix" as delete', async () => {
      const client = mockClient({
        type: "delete",
        targetType: "expense",
        targetName: "Netflix",
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "cancel Netflix",
        sampleContext,
        client
      );
      expect(result.type).toBe("delete");
      const del = result as DeleteIntent;
      expect(del.targetName).toBe("Netflix");
    });
  });

  describe("query intents", () => {
    it('parses "what\'s my biggest expense" as query with computed answer', async () => {
      const client = mockClient({
        type: "query",
        question: "what's my biggest expense",
        answer: "Your biggest expense is Rent at $2,000/month.",
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "what's my biggest expense",
        sampleContext,
        client
      );
      expect(result.type).toBe("query");
      const query = result as QueryIntent;
      expect(query.question).toBe("what's my biggest expense");
      expect(query.confidence).toBe("high");
    });
  });

  describe("what-if intents", () => {
    it('parses "What if I cancel gym?" as toggle_off', async () => {
      const client = mockClient({
        type: "whatif",
        changes: [{ action: "toggle_off", targetName: "Gym Membership" }],
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "What if I cancel gym?",
        sampleContext,
        client
      );
      expect(result.type).toBe("whatif");
      const whatif = result as WhatIfIntent;
      expect(whatif.changes).toHaveLength(1);
      expect(whatif.changes[0].action).toBe("toggle_off");
      expect(whatif.changes[0].targetName).toBe("Gym Membership");
    });

    it('parses "What if Netflix goes up to $30?" as override_amount', async () => {
      const client = mockClient({
        type: "whatif",
        changes: [{ action: "override_amount", targetName: "Netflix", amount: 30 }],
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "What if Netflix goes up to $30?",
        sampleContext,
        client
      );
      expect(result.type).toBe("whatif");
      const whatif = result as WhatIfIntent;
      expect(whatif.changes[0].action).toBe("override_amount");
      expect(whatif.changes[0].amount).toBe(30);
    });

    it('parses "What if I add a $2000 holiday in December?" as add_hypothetical', async () => {
      const client = mockClient({
        type: "whatif",
        changes: [{ action: "add_hypothetical", targetName: "Holiday", amount: 2000, dueDate: "2025-12-01" }],
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "What if I add a $2000 holiday in December?",
        emptyContext,
        client
      );
      expect(result.type).toBe("whatif");
      const whatif = result as WhatIfIntent;
      expect(whatif.changes[0].action).toBe("add_hypothetical");
      expect(whatif.changes[0].amount).toBe(2000);
      expect(whatif.changes[0].dueDate).toBeDefined();
    });
  });

  describe("escalation intents", () => {
    it('parses "rent goes up to $2,200 in July" as one-off absolute', async () => {
      const client = mockClient({
        type: "escalation",
        action: "add",
        targetName: "Rent",
        confidence: "high",
        changeType: "absolute",
        value: 2200,
        effectiveDate: "2025-07-01",
      });

      const result = await parseNaturalLanguage(
        "rent goes up to $2,200 in July",
        sampleContext,
        client
      );
      expect(result.type).toBe("escalation");
      const esc = result as EscalationIntent;
      expect(esc.action).toBe("add");
      expect(esc.changeType).toBe("absolute");
      expect(esc.value).toBe(2200);
      expect(esc.effectiveDate).toMatch(/2025-07-01/);
    });

    it('parses "rent goes up 3% every July" as recurring percentage', async () => {
      const client = mockClient({
        type: "escalation",
        action: "add",
        targetName: "Rent",
        confidence: "high",
        changeType: "percentage",
        value: 3,
        effectiveDate: "2025-07-01",
        intervalMonths: 12,
      });

      const result = await parseNaturalLanguage(
        "rent goes up 3% every July",
        sampleContext,
        client
      );
      expect(result.type).toBe("escalation");
      const esc = result as EscalationIntent;
      expect(esc.changeType).toBe("percentage");
      expect(esc.value).toBe(3);
      expect(esc.intervalMonths).toBe(12);
    });

    it('parses "cancel the rent increase" as delete escalation', async () => {
      const client = mockClient({
        type: "escalation",
        action: "delete",
        targetName: "Rent",
        confidence: "high",
      });

      const result = await parseNaturalLanguage(
        "cancel the rent increase",
        sampleContext,
        client
      );
      expect(result.type).toBe("escalation");
      const esc = result as EscalationIntent;
      expect(esc.action).toBe("delete");
      expect(esc.targetName).toBe("Rent");
    });
  });

  describe("clarification", () => {
    it("returns clarification for ambiguous input", async () => {
      const client = mockClient({
        type: "clarification",
        message: 'Would you like to add "Netflix" as a new expense or edit your existing Netflix subscription?',
        originalInput: "Netflix",
      });

      const result = await parseNaturalLanguage("Netflix", sampleContext, client);
      expect(result.type).toBe("clarification");
      const clar = result as ClarificationResult;
      expect(clar.message).toContain("Netflix");
    });
  });

  describe("unrecognized and edge cases", () => {
    it("returns unrecognized for empty input without API call", async () => {
      const result = await parseNaturalLanguage("", emptyContext);
      expect(result.type).toBe("unrecognized");
      const unrec = result as UnrecognizedResult;
      expect(unrec.message).toContain("budgeting");
    });

    it("returns unrecognized for whitespace-only input without API call", async () => {
      const result = await parseNaturalLanguage("   ", emptyContext);
      expect(result.type).toBe("unrecognized");
    });

    it("returns unrecognized when API returns invalid JSON", async () => {
      const client = mockClientText("I don't understand that");

      const result = await parseNaturalLanguage("something weird", emptyContext, client);
      expect(result.type).toBe("unrecognized");
    });
  });

  describe("error handling", () => {
    it("throws MissingApiKeyError when ANTHROPIC_API_KEY is not set", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(
        parseNaturalLanguage("add Netflix $22.99 monthly", emptyContext)
      ).rejects.toThrow(MissingApiKeyError);
    });

    it("throws user-friendly error when API call fails", async () => {
      const client = mockClientError(new Error("API timeout"));

      await expect(
        parseNaturalLanguage("add Netflix $22.99 monthly", emptyContext, client)
      ).rejects.toThrow("Something went wrong — try again");
    });
  });

  describe("API call structure", () => {
    it("calls Claude API with correct model and financial context", async () => {
      const client = mockClient({
        type: "create",
        targetType: "expense",
        confidence: "high",
        obligationFields: { name: "Netflix", type: "recurring", amount: 22.99, frequency: "monthly" },
      });

      await parseNaturalLanguage("add Netflix $22.99 monthly", sampleContext, client);

      const createFn = client.messages.create as ReturnType<typeof vi.fn>;
      expect(createFn).toHaveBeenCalledTimes(1);
      const callArgs = createFn.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.model).toBe("claude-sonnet-4-5-20250929");
      expect(callArgs.max_tokens).toBe(1024);

      // Verify user message includes financial context
      const messages = callArgs.messages as Array<{ role: string; content: string }>;
      expect(messages[0].content).toContain("Netflix");
      expect(messages[0].content).toContain("Gym Membership");
      expect(messages[0].content).toContain("Rent");
      expect(messages[0].content).toContain("Salary");
    });
  });
});
