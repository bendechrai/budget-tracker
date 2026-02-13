/**
 * Natural language parser for financial management commands.
 * Parses user input into structured intents: create, edit, delete, query.
 * Rule-based approach — no external AI API calls required.
 */

import type { IncomeFrequency } from "@/app/generated/prisma/client";
import type {
  ParseResult,
  CreateIntent,
  EditIntent,
  DeleteIntent,
  QueryIntent,
  TargetType,
  ParseConfidence,
} from "./types";

/** Patterns indicating income (vs expense). */
const INCOME_KEYWORDS = [
  "paid",
  "earn",
  "salary",
  "wage",
  "income",
  "get paid",
  "receive",
  "payment from",
];

/** Patterns indicating a create action. */
const CREATE_KEYWORDS = ["add", "create", "new", "track", "start tracking"];

/** Patterns indicating an edit action. */
const EDIT_KEYWORDS = ["change", "update", "modify", "set", "make", "adjust"];

/** Patterns indicating a delete action. */
const DELETE_KEYWORDS = ["delete", "remove", "cancel", "stop tracking", "drop"];

/** Patterns indicating a query. */
const QUERY_PATTERNS = [
  /^what('s| is| are)/i,
  /^how (much|many)/i,
  /^when/i,
  /^do I/i,
  /^am I/i,
  /^show me/i,
  /^list/i,
  /^tell me/i,
  /\?$/,
];

/** Frequency keyword mapping. */
const FREQUENCY_MAP: Record<string, IncomeFrequency> = {
  weekly: "weekly",
  "every week": "weekly",
  "per week": "weekly",
  "/week": "weekly",
  fortnightly: "fortnightly",
  "every two weeks": "fortnightly",
  "every 2 weeks": "fortnightly",
  "bi-weekly": "fortnightly",
  biweekly: "fortnightly",
  "every fortnight": "fortnightly",
  monthly: "monthly",
  "every month": "monthly",
  "per month": "monthly",
  "/month": "monthly",
  "a month": "monthly",
  quarterly: "quarterly",
  "every quarter": "quarterly",
  "every 3 months": "quarterly",
  "every three months": "quarterly",
  yearly: "annual",
  annually: "annual",
  "every year": "annual",
  "per year": "annual",
  "/year": "annual",
  "a year": "annual",
  annual: "annual",
};

/** Frequency shorthand after amount (e.g. "$100/month"). */
const FREQUENCY_SLASH_MAP: Record<string, IncomeFrequency> = {
  wk: "weekly",
  week: "weekly",
  fortnight: "fortnightly",
  fn: "fortnightly",
  mo: "monthly",
  month: "monthly",
  mth: "monthly",
  qtr: "quarterly",
  quarter: "quarterly",
  yr: "annual",
  year: "annual",
};

/**
 * Parse natural language input into a structured intent.
 */
export function parseNaturalLanguage(input: string): ParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      type: "unrecognized",
      message:
        "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
      originalInput: input,
    };
  }

  const lower = trimmed.toLowerCase();

  // Check for query intent first (questions)
  if (isQuery(lower)) {
    return parseQuery(trimmed);
  }

  // Check for delete intent
  if (isDelete(lower)) {
    return parseDelete(trimmed, lower);
  }

  // Check for edit intent
  if (isEdit(lower)) {
    return parseEdit(trimmed, lower);
  }

  // Check for create intent (explicit or implicit)
  if (isCreate(lower)) {
    return parseCreate(trimmed, lower);
  }

  // Try implicit create: "Netflix $22.99 monthly"
  const implicitCreate = tryImplicitCreate(trimmed, lower);
  if (implicitCreate) {
    return implicitCreate;
  }

  // Ambiguous: just a name with no verb
  if (/^[a-z\s]+$/i.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
    return {
      type: "clarification",
      message: `Would you like to add "${trimmed}" as a new expense, or edit your existing ${trimmed} entry?`,
      originalInput: input,
    };
  }

  return {
    type: "unrecognized",
    message:
      "I help with budgeting and expenses. Try something like 'Add rent $1,500 monthly'",
    originalInput: input,
  };
}

function isQuery(lower: string): boolean {
  return QUERY_PATTERNS.some((p) => p.test(lower));
}

function isDelete(lower: string): boolean {
  return DELETE_KEYWORDS.some((kw) => lower.startsWith(kw));
}

function isEdit(lower: string): boolean {
  return EDIT_KEYWORDS.some((kw) => lower.startsWith(kw));
}

function isCreate(lower: string): boolean {
  return CREATE_KEYWORDS.some((kw) => lower.startsWith(kw));
}

/**
 * Parse a query intent.
 */
function parseQuery(input: string): QueryIntent {
  return {
    type: "query",
    question: input,
    confidence: "high",
  };
}

/**
 * Parse a delete intent.
 * Examples: "delete Spotify", "remove the gym membership", "cancel Netflix"
 */
function parseDelete(input: string, lower: string): DeleteIntent {
  // Strip the delete keyword
  let rest = lower;
  for (const kw of DELETE_KEYWORDS) {
    if (rest.startsWith(kw)) {
      rest = rest.slice(kw.length).trim();
      break;
    }
  }

  // Strip articles
  rest = rest.replace(/^(the|my|a|an)\s+/i, "");

  // Strip trailing "subscription", "membership" etc. for matching
  const targetName = rest
    .replace(/\s+(subscription|membership|payment|expense|income)$/i, "")
    .trim();

  const targetType = detectTargetType(lower);

  return {
    type: "delete",
    targetType,
    targetName: targetName || extractNameFromInput(input),
    confidence: targetName ? "high" : "medium",
  };
}

/**
 * Parse an edit intent.
 * Examples: "change gym to $60", "change gym membership to $60",
 * "update Netflix to $25 monthly", "set rent to $2000"
 */
function parseEdit(input: string, lower: string): EditIntent {
  // Strip the edit keyword
  let rest = lower;
  for (const kw of EDIT_KEYWORDS) {
    if (rest.startsWith(kw)) {
      rest = rest.slice(kw.length).trim();
      break;
    }
  }

  // Strip articles
  rest = rest.replace(/^(the|my|a|an)\s+/i, "");

  // Try to parse "X to $Y [frequency]" pattern
  const toPattern = /^(.+?)\s+to\s+(.+)$/i;
  const toMatch = rest.match(toPattern);

  let targetName: string;
  let changePart: string;

  if (toMatch) {
    targetName = toMatch[1].trim();
    changePart = toMatch[2].trim();
  } else {
    // Try "X $Y" pattern
    const amountInRest = extractAmount(rest);
    if (amountInRest !== null) {
      const beforeAmount = rest.replace(/\$[\d,]+(?:\.\d{1,2})?/, "").trim();
      targetName = beforeAmount;
      changePart = rest;
    } else {
      targetName = rest;
      changePart = "";
    }
  }

  // Clean up target name
  targetName = targetName
    .replace(/\s+(subscription|membership|payment|expense|income)$/i, "")
    .trim();

  const changes: EditIntent["changes"] = {};
  let confidence: ParseConfidence = "medium";

  // Extract amount from change part
  const amount = extractAmount(changePart);
  if (amount !== null) {
    changes.amount = amount;
    confidence = "high";
  }

  // Extract frequency from change part
  const frequency = extractFrequency(changePart);
  if (frequency) {
    changes.frequency = frequency;
    confidence = "high";
  }

  // Handle pause/resume
  if (/\bpause\b/i.test(lower)) {
    changes.isPaused = true;
    confidence = "high";
  } else if (/\b(unpause|resume)\b/i.test(lower)) {
    changes.isPaused = false;
    confidence = "high";
  }

  const targetType = detectTargetType(lower);

  return {
    type: "edit",
    targetType,
    targetName: targetName || extractNameFromInput(input),
    confidence,
    changes,
  };
}

/**
 * Parse a create intent.
 * Examples: "Add Netflix $22.99 monthly", "track rent $1500/month",
 * "I get paid $3,200 every second Friday"
 */
function parseCreate(input: string, lower: string): CreateIntent {
  // Strip the create keyword
  let rest = lower;
  for (const kw of CREATE_KEYWORDS) {
    if (rest.startsWith(kw)) {
      rest = rest.slice(kw.length).trim();
      break;
    }
  }

  return buildCreateIntent(input, rest);
}

/**
 * Try to parse as an implicit create (no verb).
 * "Netflix $22.99 monthly" → create expense
 * "$3,200 salary every two weeks" → create income
 */
function tryImplicitCreate(input: string, lower: string): CreateIntent | null {
  const amount = extractAmount(lower);
  const frequency = extractFrequency(lower);

  if (amount !== null && frequency) {
    return buildCreateIntent(input, lower);
  }

  // Check for income pattern: "I get paid $X..."
  if (/i\s+(get\s+)?paid/i.test(lower) || INCOME_KEYWORDS.some((kw) => lower.includes(kw))) {
    return buildCreateIntent(input, lower);
  }

  return null;
}

/**
 * Build a CreateIntent from the descriptive part of input.
 */
function buildCreateIntent(originalInput: string, rest: string): CreateIntent {
  const targetType = detectTargetType(rest);
  const amount = extractAmount(rest);
  const frequency = extractFrequency(rest);
  const name = extractName(rest);

  let confidence: ParseConfidence = "low";
  if (amount !== null && name) confidence = "medium";
  if (amount !== null && name && frequency) confidence = "high";

  if (targetType === "income") {
    return {
      type: "create",
      targetType: "income",
      confidence,
      incomeFields: {
        name: name || extractNameFromInput(originalInput),
        expectedAmount: amount ?? 0,
        frequency: frequency ?? "monthly",
        isIrregular: frequency === "irregular",
      },
    };
  }

  return {
    type: "create",
    targetType: "expense",
    confidence,
    obligationFields: {
      name: name || extractNameFromInput(originalInput),
      type: "recurring",
      amount: amount ?? 0,
      frequency: frequency ?? "monthly",
    },
  };
}

/**
 * Extract a dollar amount from text.
 * Handles: $22.99, $1,500, $3200, 22.99
 */
export function extractAmount(text: string): number | null {
  // Match $X,XXX.XX or $X.XX or $XXXX patterns
  const dollarMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (dollarMatch) {
    return parseFloat(dollarMatch[1].replace(/,/g, ""));
  }

  // Match amount with slash-frequency: "1800/year", "22.99/month"
  const slashMatch = text.match(/([\d,]+(?:\.\d{1,2})?)\/\w+/);
  if (slashMatch) {
    return parseFloat(slashMatch[1].replace(/,/g, ""));
  }

  return null;
}

/**
 * Extract frequency from text.
 */
export function extractFrequency(text: string): IncomeFrequency | null {
  const lower = text.toLowerCase();

  // Check for "every second Friday/week" → fortnightly
  if (/every\s+(second|other|2nd)\s+(week|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i.test(lower)) {
    return "fortnightly";
  }

  // Check explicit frequency keywords (longer phrases first)
  const sortedKeys = Object.keys(FREQUENCY_MAP).sort(
    (a, b) => b.length - a.length
  );
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      return FREQUENCY_MAP[key];
    }
  }

  // Check slash-frequency: "$100/month", "1800/year"
  const slashMatch = lower.match(/\/(\w+)/);
  if (slashMatch) {
    const unit = slashMatch[1];
    if (unit in FREQUENCY_SLASH_MAP) {
      return FREQUENCY_SLASH_MAP[unit];
    }
  }

  return null;
}

/**
 * Extract a name/label from parsed text by removing amounts, frequencies, and noise.
 */
function extractName(text: string): string {
  let cleaned = text
    // Remove dollar amounts
    .replace(/\$\s*[\d,]+(?:\.\d{1,2})?/g, "")
    // Remove slash-frequencies (e.g. /month, /year)
    .replace(/\/\w+/g, "")
    // Remove "I get paid" and similar
    .replace(/i\s+(get\s+)?paid/gi, "")
    .replace(/i\s+(earn|receive|make)/gi, "");

  // Remove frequency keywords
  const sortedKeys = Object.keys(FREQUENCY_MAP).sort(
    (a, b) => b.length - a.length
  );
  for (const key of sortedKeys) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegex(key)}\\b`, "gi"), "");
  }

  // Remove articles and common noise words
  cleaned = cleaned
    .replace(/\b(the|my|a|an|as|for|of|in|on|at|to|is|it)\b/gi, "")
    .replace(/\b(new|expense|income|subscription|membership|payment)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Capitalize first letter of each word
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Last-resort name extraction from original input.
 */
function extractNameFromInput(input: string): string {
  const name = extractName(input.toLowerCase());
  return name || "Unnamed";
}

/**
 * Detect whether the input refers to income or an expense.
 */
function detectTargetType(text: string): TargetType {
  const lower = text.toLowerCase();
  for (const keyword of INCOME_KEYWORDS) {
    if (lower.includes(keyword)) return "income";
  }
  if (/\b(income)\b/i.test(lower)) return "income";
  return "expense";
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
