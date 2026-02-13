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
  WhatIfIntent,
  WhatIfChange,
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

  // Check for what-if intent first
  if (isWhatIf(lower)) {
    return parseWhatIf(trimmed, lower);
  }

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

/** Keywords indicating a cancel/toggle-off what-if action. */
const WHATIF_CANCEL_KEYWORDS = [
  "cancel",
  "drop",
  "remove",
  "stop",
  "get rid of",
  "ditch",
  "cut",
  "skip",
  "didn't have",
  "don't have",
  "didn't pay",
  "don't pay",
];

/**
 * Detect whether input is a what-if scenario request.
 */
function isWhatIf(lower: string): boolean {
  return lower.startsWith("what if ");
}

/**
 * Parse what-if intent(s) from input.
 * Supports:
 *   "What if I cancel gym?" → toggle_off
 *   "What if Netflix goes up to $30?" → override_amount
 *   "What if I add a $2,000 holiday in December?" → add_hypothetical
 *   "What if I cancel gym and Netflix?" → multiple toggle_off
 */
function parseWhatIf(_input: string, lower: string): WhatIfIntent {
  // Strip "what if " prefix and trailing punctuation
  let rest = lower.slice("what if ".length).trim();
  rest = rest.replace(/[?!.]+$/, "").trim();

  // Strip leading "I " or "my "
  rest = rest.replace(/^(i\s+|my\s+)/i, "");

  // Check for compound "and" — split and parse each part
  const parts = splitWhatIfParts(rest);

  const changes: WhatIfChange[] = [];

  for (const part of parts) {
    const change = parseWhatIfPart(part.trim());
    if (change) {
      changes.push(change);
    }
  }

  if (changes.length === 0) {
    // Fallback: treat as a toggle-off with the entire rest as target name
    const name = cleanWhatIfTargetName(rest);
    changes.push({
      action: "toggle_off",
      targetName: name || rest,
    });
  }

  const confidence: ParseConfidence = changes.length > 0 ? "high" : "medium";

  return {
    type: "whatif",
    changes,
    confidence,
  };
}

/**
 * Split a what-if clause on "and" while keeping compound names intact.
 * "cancel gym and Netflix" → ["cancel gym", "cancel Netflix"]
 * "add a $2000 holiday" → ["add a $2000 holiday"]
 */
function splitWhatIfParts(rest: string): string[] {
  // Check if "and" appears as a coordinator between clauses
  // Pattern: "verb X and Y" or "verb X and verb Y"
  const andSplit = rest.split(/\s+and\s+/);

  if (andSplit.length <= 1) {
    return [rest];
  }

  // Check if the first part has a cancel verb — if so, propagate it
  const firstPart = andSplit[0];
  const verb = extractWhatIfVerb(firstPart);

  if (verb) {
    return andSplit.map((part, i) => {
      if (i === 0) return part;
      // If subsequent part already has a verb, keep it
      if (extractWhatIfVerb(part)) return part;
      // Otherwise prepend the verb from the first part
      return `${verb} ${part}`;
    });
  }

  return andSplit;
}

/**
 * Extract the leading verb from a what-if clause.
 */
function extractWhatIfVerb(text: string): string | null {
  for (const kw of WHATIF_CANCEL_KEYWORDS) {
    if (text.startsWith(kw)) return kw;
  }
  if (text.startsWith("add")) return "add";
  return null;
}

/**
 * Parse a single what-if clause into a WhatIfChange.
 */
function parseWhatIfPart(part: string): WhatIfChange | null {
  // Check for "add" pattern → add_hypothetical
  // "add a $2,000 holiday in December"
  const addMatch = part.match(/^add\s+/i);
  if (addMatch) {
    return parseWhatIfAdd(part.slice(addMatch[0].length));
  }

  // Check for amount override pattern
  // "Netflix goes up to $30", "rent increases to $2200", "X goes to $Y"
  const overridePatterns = [
    /^(.+?)\s+(?:goes?\s+up\s+to|increases?\s+to|goes?\s+to|is|was|were|costs?)\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
    /^(.+?)\s+(?:goes?\s+up\s+to|increases?\s+to|goes?\s+to|is|was|were|costs?)\s+([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of overridePatterns) {
    const match = part.match(pattern);
    if (match) {
      const name = cleanWhatIfTargetName(match[1]);
      const amount = parseFloat(match[2].replace(/,/g, ""));
      if (name && !isNaN(amount)) {
        return {
          action: "override_amount",
          targetName: name,
          amount,
        };
      }
    }
  }

  // Check for cancel/toggle-off patterns
  for (const kw of WHATIF_CANCEL_KEYWORDS) {
    if (part.startsWith(kw)) {
      const afterKeyword = part.slice(kw.length).trim();
      const name = cleanWhatIfTargetName(afterKeyword);
      if (name) {
        return {
          action: "toggle_off",
          targetName: name,
        };
      }
    }
  }

  return null;
}

/**
 * Parse an "add" what-if clause into a hypothetical obligation.
 * "a $2,000 holiday in December" → add_hypothetical
 */
function parseWhatIfAdd(rest: string): WhatIfChange {
  // Strip leading articles
  const cleaned = rest.replace(/^(a|an|the)\s+/i, "");

  const amount = extractAmount(cleaned);
  const frequency = extractFrequency(cleaned);
  const dueDate = extractWhatIfDate(cleaned);

  // Strip date references before extracting name so "in December" doesn't become part of the name
  const withoutDate = cleaned
    .replace(/\b(in\s+\w+(\s+\d{4})?)\b/gi, "")
    .replace(/\bnext\s+month\b/gi, "");
  const name = extractName(withoutDate);

  return {
    action: "add_hypothetical",
    targetName: name || "Hypothetical",
    amount: amount ?? 0,
    frequency: frequency ?? undefined,
    dueDate: dueDate ?? undefined,
  };
}

/**
 * Clean a target name from a what-if clause by stripping noise words.
 */
function cleanWhatIfTargetName(text: string): string {
  return text
    .replace(/^(the|my|a|an)\s+/i, "")
    .replace(/\s+(subscription|membership|payment|expense)$/i, "")
    .trim();
}

/** Month names for date extraction. */
const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Extract a rough date reference from text (e.g. "in December", "next month").
 * Returns ISO date string or null.
 */
function extractWhatIfDate(text: string): string | null {
  const lower = text.toLowerCase();

  // "in December", "in March 2025"
  const monthMatch = lower.match(/\bin\s+(\w+)(?:\s+(\d{4}))?\b/);
  if (monthMatch) {
    const monthName = monthMatch[1];
    const yearStr = monthMatch[2];
    if (monthName in MONTH_NAMES) {
      const now = new Date();
      let year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
      const month = MONTH_NAMES[monthName];
      // If month is in the past this year and no year specified, use next year
      if (!yearStr && month < now.getMonth()) {
        year = year + 1;
      }
      const date = new Date(year, month, 1);
      return date.toISOString().split("T")[0];
    }
  }

  // "next month"
  if (/\bnext\s+month\b/.test(lower)) {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return date.toISOString().split("T")[0];
  }

  return null;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
