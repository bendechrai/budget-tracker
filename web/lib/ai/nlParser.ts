/**
 * Natural language parser for financial management commands.
 * Uses Claude API (Sonnet) to parse user input into structured intents.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logError } from "@/lib/logging";
import type { ParseResult, FinancialContext } from "./types";

/** Error returned when the API key is not configured. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "MissingApiKeyError";
  }
}

const SYSTEM_PROMPT = `You are a financial intent parser. You receive natural language input from a user managing their budget and must classify it into a structured JSON intent.

The user has income sources (money coming in) and obligations/expenses (money going out). You will be given their current financial data so you can resolve references like "the gym" or "my Netflix".

## Intent Types

Return exactly ONE JSON object matching one of these schemas:

### create
Create a new income source or obligation.
\`\`\`json
{
  "type": "create",
  "targetType": "income" | "expense",
  "confidence": "high" | "medium" | "low",
  "incomeFields": {
    "name": "string (descriptive name)",
    "expectedAmount": number,
    "frequency": "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual",
    "isIrregular": boolean
  },
  "obligationFields": {
    "name": "string (descriptive name)",
    "type": "recurring" | "recurring_with_end" | "one_off" | "custom",
    "amount": number,
    "frequency": "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual",
    "nextDueDate": "YYYY-MM-DD or omit",
    "customEntries": [{"dueDate": "YYYY-MM-DD", "amount": number}]
  }
}
\`\`\`
Include ONLY incomeFields for income, ONLY obligationFields for expense. For the name field, use a sensible descriptive name — NOT the verb from the user's command. E.g. "Add an income of $1000 a month" → name: "Monthly Income", not "Add". "Netflix $22.99 monthly" → name: "Netflix".

### edit
Edit an existing item. Match the targetName against the user's existing items.
\`\`\`json
{
  "type": "edit",
  "targetType": "income" | "expense",
  "targetName": "string (matched name from user's data)",
  "confidence": "high" | "medium" | "low",
  "changes": {
    "name": "string (optional)",
    "amount": number,
    "frequency": "string (optional)",
    "isPaused": boolean
  }
}
\`\`\`
Only include fields in changes that the user wants to change.

### delete
Delete an existing item.
\`\`\`json
{
  "type": "delete",
  "targetType": "income" | "expense",
  "targetName": "string (matched name from user's data)",
  "confidence": "high" | "medium" | "low"
}
\`\`\`

### query
Answer a question about the user's finances. Provide a direct, computed answer using the financial data provided.
\`\`\`json
{
  "type": "query",
  "question": "the original question",
  "answer": "your computed answer using their data",
  "confidence": "high" | "medium" | "low"
}
\`\`\`

### whatif
A what-if scenario. Starts with "what if".
\`\`\`json
{
  "type": "whatif",
  "changes": [
    {
      "action": "toggle_off" | "override_amount" | "add_hypothetical",
      "targetName": "string",
      "amount": number,
      "frequency": "string (optional)",
      "dueDate": "YYYY-MM-DD (optional)"
    }
  ],
  "confidence": "high" | "medium" | "low"
}
\`\`\`

### escalation
A price change / escalation rule for an obligation.
\`\`\`json
{
  "type": "escalation",
  "action": "add" | "delete",
  "targetName": "string",
  "confidence": "high" | "medium" | "low",
  "changeType": "absolute" | "percentage" | "fixed_increase",
  "value": number,
  "effectiveDate": "YYYY-MM-DD (optional)",
  "intervalMonths": number
}
\`\`\`
- absolute: sets new price (e.g. "goes up to $2,200")
- percentage: increases by percentage (e.g. "goes up 3%")
- fixed_increase: increases by dollar amount (e.g. "goes up $50")
- intervalMonths: for recurring escalations (12 = annual, null/omit for one-off)
- For delete action, only targetName and confidence are needed.

### clarification
When the input is ambiguous and you need more information.
\`\`\`json
{
  "type": "clarification",
  "message": "your question to the user",
  "originalInput": "the original input"
}
\`\`\`

### unrecognized
When the input cannot be understood as a financial command.
\`\`\`json
{
  "type": "unrecognized",
  "message": "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
  "originalInput": "the original input"
}
\`\`\`

## Rules
- Return ONLY valid JSON. No markdown, no explanation, no code fences.
- For create intents, always generate a sensible descriptive name. Never use the verb as the name.
- For edit/delete, match targetName against the user's existing items using fuzzy matching (e.g. "the gym" matches "Gym Membership").
- For query intents, compute and provide a real answer using the financial data. Do NOT echo the question back.
- For dates, use the first of the month when only a month is given. If a month is in the past and no year is specified, use next year.
- Today's date is provided in the user message for date calculations.
- Default expense type to "recurring" unless the input clearly indicates otherwise.
- Default frequency to "monthly" when not specified for recurring items.
- Empty or whitespace-only input should return unrecognized.`;

/**
 * Build the user message with financial context.
 */
function buildUserMessage(input: string, context: FinancialContext): string {
  const today = new Date().toISOString().split("T")[0];
  let message = `Today's date: ${today}\n\nUser input: "${input}"`;

  if (context.incomeSources.length > 0 || context.obligations.length > 0) {
    message += "\n\n## User's Financial Data\n";

    if (context.incomeSources.length > 0) {
      message += "\n### Income Sources\n";
      for (const inc of context.incomeSources) {
        message += `- ${inc.name}: $${inc.expectedAmount} ${inc.frequency}\n`;
      }
    }

    if (context.obligations.length > 0) {
      message += "\n### Obligations/Expenses\n";
      for (const obl of context.obligations) {
        message += `- ${obl.name}: $${obl.amount} ${obl.frequency ?? obl.type}`;
        if (obl.nextDueDate) {
          message += ` (next due: ${obl.nextDueDate})`;
        }
        message += "\n";
      }
    }
  }

  return message;
}

/**
 * Parse the LLM response JSON into a ParseResult.
 * Validates the structure and returns a safe default if parsing fails.
 */
function parseResponse(responseText: string, originalInput: string): ParseResult {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      type: "unrecognized",
      message: "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
      originalInput,
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as ParseResult;

  // Validate type field exists and is recognized
  const validTypes = ["create", "edit", "delete", "query", "whatif", "escalation", "clarification", "unrecognized"];
  if (!parsed.type || !validTypes.includes(parsed.type)) {
    return {
      type: "unrecognized",
      message: "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
      originalInput,
    };
  }

  return parsed;
}

/**
 * Parse natural language input into a structured intent using Claude API.
 *
 * @param input - The raw user text input
 * @param context - The user's financial data for resolving references
 * @param client - Optional Anthropic client (for testing/dependency injection)
 * @returns Parsed intent result
 * @throws MissingApiKeyError if ANTHROPIC_API_KEY is not set
 */
export async function parseNaturalLanguage(
  input: string,
  context: FinancialContext,
  client?: Anthropic
): Promise<ParseResult> {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      type: "unrecognized",
      message: "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
      originalInput: input,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingApiKeyError();
  }

  const anthropic = client ?? new Anthropic();

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserMessage(trimmed, context),
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    return parseResponse(responseText, input);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      throw error;
    }
    logError("Claude API call failed in NL parser", error);
    throw new Error("Something went wrong — try again");
  }
}
