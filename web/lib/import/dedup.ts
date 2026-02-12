/**
 * Transaction deduplication utility.
 * Three-layer dedup strategy:
 * 1. Exact reference ID match → auto-skip
 * 2. Composite fingerprint (hash of date+amount+description) → auto-skip
 * 3. Fuzzy match (same date + similar amount + similar description) → flag for review
 */

import { createHash } from "crypto";
import type { ParsedTransaction } from "./csvParser";

export interface ExistingTransaction {
  referenceId: string | null;
  fingerprint: string;
  date: Date;
  amount: number;
  description: string;
}

export interface DedupResult {
  /** Transactions that are genuinely new — safe to import. */
  newTransactions: ParsedTransaction[];
  /** Transactions auto-skipped (exact referenceId or fingerprint match). */
  skipped: ParsedTransaction[];
  /** Transactions flagged for user review (fuzzy near-match). */
  flagged: FlaggedTransaction[];
}

export interface FlaggedTransaction {
  transaction: ParsedTransaction;
  matchedExisting: ExistingTransaction;
  reason: string;
}

/**
 * Generate a composite fingerprint for a parsed transaction.
 * Hash of date (YYYY-MM-DD) + amount (2dp) + lowercase trimmed description.
 */
export function generateFingerprint(txn: ParsedTransaction): string {
  const dateStr = txn.date.toISOString().slice(0, 10);
  const amountStr = txn.amount.toFixed(2);
  const desc = txn.description.toLowerCase().trim();
  const raw = `${dateStr}|${amountStr}|${desc}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Normalize a description for fuzzy comparison.
 * Strips common noise: extra spaces, punctuation, casing.
 */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute similarity between two strings using Dice coefficient on bigrams.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
function stringSimilarity(a: string, b: string): number {
  const normA = normalizeDescription(a);
  const normB = normalizeDescription(b);

  if (normA === normB) return 1;
  if (normA.length < 2 || normB.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < normA.length - 1; i++) {
    bigramsA.add(normA.slice(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < normB.length - 1; i++) {
    bigramsB.add(normB.slice(i, i + 2));
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/** Amount tolerance for fuzzy matching: within 5% or $1, whichever is larger. */
function amountsAreSimilar(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const threshold = Math.max(1, Math.max(a, b) * 0.05);
  return diff <= threshold;
}

/** Check if two dates are on the same calendar day. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Description similarity threshold for fuzzy flagging. */
const FUZZY_DESC_THRESHOLD = 0.6;

/**
 * Deduplicate parsed transactions against existing transactions in the database.
 *
 * Layer 1: Exact referenceId match → skip
 * Layer 2: Fingerprint match → skip
 * Layer 3: Same date + similar amount + similar description → flag for review
 */
export function deduplicateTransactions(
  incoming: ParsedTransaction[],
  existing: ExistingTransaction[]
): DedupResult {
  const refIdSet = new Set<string>();
  for (const ex of existing) {
    if (ex.referenceId) {
      refIdSet.add(ex.referenceId);
    }
  }

  const fingerprintSet = new Set<string>();
  for (const ex of existing) {
    fingerprintSet.add(ex.fingerprint);
  }

  const result: DedupResult = {
    newTransactions: [],
    skipped: [],
    flagged: [],
  };

  for (const txn of incoming) {
    // Layer 1: Exact reference ID match
    if (txn.referenceId && refIdSet.has(txn.referenceId)) {
      result.skipped.push(txn);
      continue;
    }

    // Layer 2: Fingerprint match
    const fingerprint = generateFingerprint(txn);
    if (fingerprintSet.has(fingerprint)) {
      result.skipped.push(txn);
      continue;
    }

    // Layer 3: Fuzzy match
    let fuzzyMatch: ExistingTransaction | null = null;
    for (const ex of existing) {
      if (
        sameDay(txn.date, ex.date) &&
        amountsAreSimilar(txn.amount, ex.amount) &&
        stringSimilarity(txn.description, ex.description) >= FUZZY_DESC_THRESHOLD
      ) {
        fuzzyMatch = ex;
        break;
      }
    }

    if (fuzzyMatch) {
      result.flagged.push({
        transaction: txn,
        matchedExisting: fuzzyMatch,
        reason: `Similar transaction found: "${fuzzyMatch.description}" on ${fuzzyMatch.date.toISOString().slice(0, 10)} for ${fuzzyMatch.amount.toFixed(2)}`,
      });
      continue;
    }

    // No match — this is a new transaction
    result.newTransactions.push(txn);
  }

  return result;
}
