import { describe, it, expect, vi } from "vitest";
import { parseTextWithAI, parsePDF } from "../pdfParser";
import type Anthropic from "@anthropic-ai/sdk";

// Mock pdf-parse — v2 exports a PDFParse class
const mockGetText = vi.fn();
vi.mock("pdf-parse", () => {
  return {
    PDFParse: class MockPDFParse {
      getText = mockGetText;
    },
  };
});

function createMockAIClient(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as unknown as Anthropic;
}

const sampleAIResponse = JSON.stringify({
  transactions: [
    {
      date: "2024-01-15",
      description: "GROCERY STORE",
      amount: 45.5,
      type: "debit",
      referenceId: "REF001",
      confidence: "high",
    },
    {
      date: "2024-01-16",
      description: "EMPLOYER INC",
      amount: 3000.0,
      type: "credit",
      referenceId: "REF002",
      confidence: "high",
    },
    {
      date: "2024-01-20",
      description: "UNKNOWN MERCHANT",
      amount: 12.99,
      type: "debit",
      referenceId: null,
      confidence: "low",
    },
  ],
});

describe("parseTextWithAI", () => {
  it("parses AI response into transactions", async () => {
    const client = createMockAIClient(sampleAIResponse);

    const result = await parseTextWithAI("sample statement text", client);

    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toEqual({
      date: "2024-01-15",
      description: "GROCERY STORE",
      amount: 45.5,
      type: "debit",
      referenceId: "REF001",
      confidence: "high",
    });
  });

  it("sends correct prompt to AI client", async () => {
    const client = createMockAIClient(sampleAIResponse);

    await parseTextWithAI("my statement text", client);

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content:
              "Parse the following bank statement text and extract all transactions:\n\nmy statement text",
          },
        ],
      })
    );
  });

  it("handles AI response wrapped in markdown code block", async () => {
    const wrappedResponse = `\`\`\`json\n${sampleAIResponse}\n\`\`\``;
    const client = createMockAIClient(wrappedResponse);

    const result = await parseTextWithAI("statement text", client);

    expect(result.transactions).toHaveLength(3);
  });

  it("throws on invalid AI response", async () => {
    const client = createMockAIClient("I cannot parse this statement.");

    await expect(parseTextWithAI("bad input", client)).rejects.toThrow(
      "AI response did not contain valid JSON"
    );
  });
});

describe("parsePDF", () => {
  it("extracts text from PDF and parses transactions", async () => {
    mockGetText.mockResolvedValue({
      text: "Date Description Amount\n15/01/2024 GROCERY STORE $45.50",
    });

    const client = createMockAIClient(sampleAIResponse);
    const buffer = Buffer.from("fake-pdf-content");

    const result = await parsePDF(buffer, client);

    // High confidence transactions
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      date: new Date("2024-01-15"),
      description: "GROCERY STORE",
      amount: 45.5,
      type: "debit",
      referenceId: "REF001",
    });
    expect(result.transactions[1]).toEqual({
      date: new Date("2024-01-16"),
      description: "EMPLOYER INC",
      amount: 3000.0,
      type: "credit",
      referenceId: "REF002",
    });

    // Low confidence transactions separated out
    expect(result.lowConfidenceTransactions).toHaveLength(1);
    expect(result.lowConfidenceTransactions[0]).toEqual({
      date: new Date("2024-01-20"),
      description: "UNKNOWN MERCHANT",
      amount: 12.99,
      type: "debit",
      referenceId: null,
    });
  });

  it("returns empty result for PDF with no text", async () => {
    mockGetText.mockResolvedValue({ text: "" });

    const buffer = Buffer.from("empty-pdf");
    const result = await parsePDF(buffer);

    expect(result.transactions).toEqual([]);
    expect(result.lowConfidenceTransactions).toEqual([]);
  });

  it("handles multi-page statement with many transactions", async () => {
    mockGetText.mockResolvedValue({
      text: "Page 1\nTransaction 1\nPage 2\nTransaction 2",
    });

    const multiPageResponse = JSON.stringify({
      transactions: [
        {
          date: "2024-01-01",
          description: "Transaction from page 1",
          amount: 100.0,
          type: "debit",
          referenceId: null,
          confidence: "high",
        },
        {
          date: "2024-01-15",
          description: "Transaction from page 2",
          amount: 200.0,
          type: "credit",
          referenceId: null,
          confidence: "high",
        },
        {
          date: "2024-02-01",
          description: "Another from page 2",
          amount: 50.0,
          type: "debit",
          referenceId: null,
          confidence: "medium",
        },
      ],
    });
    const client = createMockAIClient(multiPageResponse);

    const buffer = Buffer.from("multi-page-pdf");
    const result = await parsePDF(buffer, client);

    expect(result.transactions).toHaveLength(3);
    expect(result.lowConfidenceTransactions).toHaveLength(0);
  });

  it("skips transactions with invalid dates from AI", async () => {
    mockGetText.mockResolvedValue({ text: "Some statement text" });

    const responseWithBadDate = JSON.stringify({
      transactions: [
        {
          date: "2024-01-15",
          description: "Good transaction",
          amount: 50.0,
          type: "debit",
          referenceId: null,
          confidence: "high",
        },
        {
          date: "not-a-date",
          description: "Bad date transaction",
          amount: 25.0,
          type: "debit",
          referenceId: null,
          confidence: "high",
        },
      ],
    });
    const client = createMockAIClient(responseWithBadDate);

    const buffer = Buffer.from("pdf-content");
    const result = await parsePDF(buffer, client);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Good transaction");
  });

  it("ensures amounts are always positive", async () => {
    mockGetText.mockResolvedValue({ text: "Some statement text" });

    const responseWithNegativeAmount = JSON.stringify({
      transactions: [
        {
          date: "2024-01-15",
          description: "Negative amount",
          amount: -75.0,
          type: "debit",
          referenceId: null,
          confidence: "high",
        },
      ],
    });
    const client = createMockAIClient(responseWithNegativeAmount);

    const buffer = Buffer.from("pdf-content");
    const result = await parsePDF(buffer, client);

    expect(result.transactions[0].amount).toBe(75.0);
  });
});
