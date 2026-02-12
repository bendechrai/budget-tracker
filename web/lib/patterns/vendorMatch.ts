/**
 * Vendor name matching and normalization utilities.
 * Groups transactions by vendor similarity using fuzzy matching.
 */

/**
 * Normalize a vendor/description string for comparison.
 * Strips common noise: extra spaces, punctuation, domain suffixes, casing.
 */
export function normalizeVendor(description: string): string {
  return description
    .toLowerCase()
    .replace(/\.com|\.co|\.au|\.net|\.org/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute similarity between two strings using Dice coefficient on bigrams.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function vendorSimilarity(a: string, b: string): number {
  const normA = normalizeVendor(a);
  const normB = normalizeVendor(b);

  if (normA === normB) return 1;
  if (normA.length < 2 || normB.length < 2) return 0;

  // If one string fully contains the other, it's a strong match.
  // e.g. "netflix" is contained in "netflix subscription"
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;

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

/** Threshold for considering two vendor descriptions as the same vendor. */
const VENDOR_SIMILARITY_THRESHOLD = 0.7;

export interface TransactionRecord {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: "credit" | "debit";
}

export interface VendorGroup {
  /** The normalized representative vendor pattern for this group. */
  vendorPattern: string;
  /** All transactions in this group. */
  transactions: TransactionRecord[];
}

/**
 * Group transactions by vendor similarity.
 * Uses greedy clustering: each transaction is assigned to the first existing
 * group that exceeds the similarity threshold, or forms a new group.
 */
export function groupByVendor(transactions: TransactionRecord[]): VendorGroup[] {
  const groups: VendorGroup[] = [];

  for (const txn of transactions) {
    let matched = false;
    for (const group of groups) {
      if (vendorSimilarity(txn.description, group.vendorPattern) >= VENDOR_SIMILARITY_THRESHOLD) {
        group.transactions.push(txn);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push({
        vendorPattern: txn.description,
        transactions: [txn],
      });
    }
  }

  return groups;
}
