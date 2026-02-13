/**
 * PDF statement parser utility.
 * Extracts text from PDF via pdf-parse, then uses AI (Claude) to parse
 * transaction data from the extracted text.
 */

import { PDFParse } from "pdf-parse";
import Anthropic from "@anthropic-ai/sdk";
import type { ParsedTransaction } from "./csvParser";

export interface PDFParseResult {
  transactions: ParsedTransaction[];
  /** Transactions where AI confidence was low — flag for user review. */
  lowConfidenceTransactions: ParsedTransaction[];
}

interface AITransaction {
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  referenceId?: string | null;
  confidence: "high" | "medium" | "low";
}

interface AIParseResponse {
  transactions: AITransaction[];
}

const SYSTEM_PROMPT = `You are a bank statement parser. You receive raw text extracted from a PDF bank statement and must extract all transactions into a structured JSON format.

For each transaction, extract:
- date: the transaction date in YYYY-MM-DD format
- description: the transaction description/payee name
- amount: the absolute numeric amount (always positive)
- type: "credit" for money coming in (deposits, refunds) or "debit" for money going out (purchases, withdrawals, fees)
- referenceId: any reference number or transaction ID if present, otherwise null
- confidence: "high" if the data is clearly parsed, "medium" if some fields required interpretation, "low" if the format was unusual or data may be incorrect

Rules:
- Parse ALL transactions found in the text
- Amounts must always be positive numbers (use type field for direction)
- Dates must be in YYYY-MM-DD format
- Do not invent or fabricate transactions — only extract what is present in the text
- If a transaction's fields are ambiguous, set confidence to "low"
- Handle multi-page statements — transactions may span across page breaks
- Ignore headers, footers, balance summaries, and non-transaction content

Respond with ONLY valid JSON in this format:
{"transactions": [...]}`;

/**
 * Extract text content from a PDF buffer.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

/**
 * Parse extracted text into transactions using AI.
 * Exported for testing — allows injecting a mock AI client.
 */
export async function parseTextWithAI(
  text: string,
  client?: Anthropic
): Promise<AIParseResponse> {
  const anthropic = client ?? new Anthropic();

  const message = await anthropic.messages.create({
    model: "claude-opus-4-6-20250929",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Parse the following bank statement text and extract all transactions:\n\n${text}`,
      },
    ],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON from the response (handle possible markdown code blocks)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI response did not contain valid JSON");
  }

  const parsed: AIParseResponse = JSON.parse(jsonMatch[0]);
  return parsed;
}

/**
 * Convert AI-parsed transactions to ParsedTransaction format,
 * splitting by confidence level.
 */
function processAITransactions(aiResponse: AIParseResponse): PDFParseResult {
  const transactions: ParsedTransaction[] = [];
  const lowConfidenceTransactions: ParsedTransaction[] = [];

  for (const aiTxn of aiResponse.transactions) {
    const date = new Date(aiTxn.date);
    if (isNaN(date.getTime())) continue;

    const parsed: ParsedTransaction = {
      date,
      description: aiTxn.description,
      amount: Math.abs(aiTxn.amount),
      type: aiTxn.type === "credit" ? "credit" : "debit",
      referenceId: aiTxn.referenceId ?? null,
    };

    if (aiTxn.confidence === "low") {
      lowConfidenceTransactions.push(parsed);
    } else {
      transactions.push(parsed);
    }
  }

  return { transactions, lowConfidenceTransactions };
}

/**
 * Parse a PDF bank statement into transactions.
 * Extracts text from PDF, sends to AI for parsing, and returns structured transactions.
 *
 * @param buffer - The PDF file content as a Buffer
 * @param aiClient - Optional Anthropic client (for testing/dependency injection)
 * @returns Parsed transactions split by confidence level
 */
export async function parsePDF(
  buffer: Buffer,
  aiClient?: Anthropic
): Promise<PDFParseResult> {
  const text = await extractTextFromPDF(buffer);

  if (!text.trim()) {
    return { transactions: [], lowConfidenceTransactions: [] };
  }

  const aiResponse = await parseTextWithAI(text, aiClient);
  return processAITransactions(aiResponse);
}
