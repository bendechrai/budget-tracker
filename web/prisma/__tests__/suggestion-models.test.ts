import { describe, it, expect } from "vitest";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  SuggestionType,
  SuggestionConfidence,
  SuggestionStatus,
} from "@/app/generated/prisma/client";

describe("Suggestion models schema", () => {
  it("SuggestionType enum has income and expense values", () => {
    expect(SuggestionType.income).toBe("income");
    expect(SuggestionType.expense).toBe("expense");
  });

  it("SuggestionConfidence enum has high, medium, low values", () => {
    expect(SuggestionConfidence.high).toBe("high");
    expect(SuggestionConfidence.medium).toBe("medium");
    expect(SuggestionConfidence.low).toBe("low");
  });

  it("SuggestionStatus enum has pending, accepted, dismissed values", () => {
    expect(SuggestionStatus.pending).toBe("pending");
    expect(SuggestionStatus.accepted).toBe("accepted");
    expect(SuggestionStatus.dismissed).toBe("dismissed");
  });

  it("Suggestion model has all required fields", () => {
    const suggestion: Prisma.SuggestionCreateInput = {
      user: { connect: { id: "test" } },
      type: SuggestionType.expense,
      vendorPattern: "Netflix",
      detectedAmount: 15.99,
      detectedFrequency: "monthly",
      confidence: SuggestionConfidence.high,
      matchingTransactionCount: 5,
    };

    expect(suggestion.type).toBe("expense");
    expect(suggestion.vendorPattern).toBe("Netflix");
    expect(suggestion.detectedAmount).toBe(15.99);
    expect(suggestion.detectedFrequency).toBe("monthly");
    expect(suggestion.confidence).toBe("high");
    expect(suggestion.matchingTransactionCount).toBe(5);
  });

  it("Suggestion model supports optional fields", () => {
    const suggestion: Prisma.SuggestionCreateInput = {
      user: { connect: { id: "test" } },
      type: SuggestionType.income,
      vendorPattern: "Employer",
      detectedAmount: 5000,
      detectedAmountMin: 4800,
      detectedAmountMax: 5200,
      detectedFrequency: "monthly",
      confidence: SuggestionConfidence.medium,
      matchingTransactionCount: 3,
      status: SuggestionStatus.pending,
      linkedIncomeSource: { connect: { id: "inc-1" } },
    };

    expect(suggestion.detectedAmountMin).toBe(4800);
    expect(suggestion.detectedAmountMax).toBe(5200);
    expect(suggestion.status).toBe("pending");
  });

  it("SuggestionTransaction has composite key of suggestionId and transactionId", () => {
    const where: Prisma.SuggestionTransactionWhereUniqueInput = {
      suggestionId_transactionId: {
        suggestionId: "sug-1",
        transactionId: "txn-1",
      },
    };

    expect(where.suggestionId_transactionId?.suggestionId).toBe("sug-1");
    expect(where.suggestionId_transactionId?.transactionId).toBe("txn-1");
  });
});
