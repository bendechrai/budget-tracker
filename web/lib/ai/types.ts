import type { IncomeFrequency, ObligationType } from "@/app/generated/prisma/client";

/** The kind of action the user wants to perform. */
export type IntentType = "create" | "edit" | "delete" | "query";

/** Whether the target is an income source or an obligation (expense). */
export type TargetType = "income" | "expense";

/** Confidence in the parsed intent. */
export type ParseConfidence = "high" | "medium" | "low";

/** Parsed fields for creating an income source. */
export interface CreateIncomeFields {
  name: string;
  expectedAmount: number;
  frequency: IncomeFrequency;
  frequencyDays?: number;
  isIrregular?: boolean;
  nextExpectedDate?: string;
}

/** Parsed fields for creating an obligation. */
export interface CreateObligationFields {
  name: string;
  type: ObligationType;
  amount: number;
  frequency?: IncomeFrequency;
  frequencyDays?: number;
  startDate?: string;
  endDate?: string;
  nextDueDate?: string;
  customEntries?: Array<{ dueDate: string; amount: number }>;
}

/** A create intent with all parsed data. */
export interface CreateIntent {
  type: "create";
  targetType: TargetType;
  confidence: ParseConfidence;
  incomeFields?: CreateIncomeFields;
  obligationFields?: CreateObligationFields;
}

/** Fields that can be edited on an existing item. */
export interface EditFields {
  name?: string;
  amount?: number;
  frequency?: IncomeFrequency;
  frequencyDays?: number;
  isPaused?: boolean;
  nextDueDate?: string;
}

/** An edit intent targeting an existing item. */
export interface EditIntent {
  type: "edit";
  targetType: TargetType;
  targetName: string;
  confidence: ParseConfidence;
  changes: EditFields;
}

/** A delete intent targeting an existing item. */
export interface DeleteIntent {
  type: "delete";
  targetType: TargetType;
  targetName: string;
  confidence: ParseConfidence;
}

/** A query intent asking a question about the user's data. */
export interface QueryIntent {
  type: "query";
  question: string;
  confidence: ParseConfidence;
}

/** A clarification request when the input is ambiguous. */
export interface ClarificationResult {
  type: "clarification";
  message: string;
  originalInput: string;
}

/** A result when the input cannot be parsed. */
export interface UnrecognizedResult {
  type: "unrecognized";
  message: string;
  originalInput: string;
}

/** Escalation change type — how the new amount is determined. */
export type EscalationChangeType = "absolute" | "percentage" | "fixed_increase";

/** An escalation intent parsed from natural language. */
export interface EscalationIntent {
  type: "escalation";
  action: "add" | "delete";
  targetName: string;
  confidence: ParseConfidence;
  /** Only present for action=add */
  changeType?: EscalationChangeType;
  /** The value: target amount for absolute, percentage for percentage, dollar increase for fixed_increase */
  value?: number;
  /** When the change takes effect (ISO date string) */
  effectiveDate?: string;
  /** Recurrence interval in months (null/undefined means one-off) */
  intervalMonths?: number;
}

/** The kind of what-if action the user wants to perform. */
export type WhatIfAction = "toggle_off" | "override_amount" | "add_hypothetical";

/** A single what-if change parsed from user input. */
export interface WhatIfChange {
  action: WhatIfAction;
  targetName?: string;
  amount?: number;
  frequency?: IncomeFrequency;
  dueDate?: string;
}

/** A what-if intent with one or more scenario changes. */
export interface WhatIfIntent {
  type: "whatif";
  changes: WhatIfChange[];
  confidence: ParseConfidence;
}

/** All possible results from parsing natural language input. */
export type ParseResult =
  | CreateIntent
  | EditIntent
  | DeleteIntent
  | QueryIntent
  | WhatIfIntent
  | EscalationIntent
  | ClarificationResult
  | UnrecognizedResult;
