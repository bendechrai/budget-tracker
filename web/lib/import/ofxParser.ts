/**
 * OFX/QFX statement parser utility.
 * Parses OFX (Open Financial Exchange) content into transaction objects.
 * OFX is an SGML-based format used by financial institutions.
 */

import type { ParsedTransaction } from "./csvParser";

interface OFXTransaction {
  TRNTYPE: string;
  DTPOSTED: string;
  TRNAMT: string;
  FITID: string;
  NAME?: string;
  MEMO?: string;
  CHECKNUM?: string;
}

/**
 * Parse an OFX date string (YYYYMMDD or YYYYMMDDHHMMSS[.XXX:TZ]) into a Date.
 */
export function parseOFXDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim().length < 8) return null;

  const trimmed = dateStr.trim();
  // Extract just the YYYYMMDD portion
  const dateMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;

  return d;
}

/**
 * Extract the value of an OFX tag from a block of text.
 * OFX uses SGML-style tags: <TAGNAME>value (no closing tag for leaf elements).
 */
function extractTagValue(block: string, tagName: string): string | undefined {
  // Match <TAGNAME>value, where value runs until the next < or end of string
  const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extract all STMTTRN blocks from OFX content.
 */
function extractTransactionBlocks(content: string): string[] {
  const blocks: string[] = [];
  const upperContent = content.toUpperCase();
  let searchFrom = 0;

  while (true) {
    const startIdx = upperContent.indexOf("<STMTTRN>", searchFrom);
    if (startIdx === -1) break;

    // Find the end — either </STMTTRN> or the next <STMTTRN>
    const closeIdx = upperContent.indexOf("</STMTTRN>", startIdx);
    const nextOpenIdx = upperContent.indexOf("<STMTTRN>", startIdx + 9);

    let endIdx: number;
    if (closeIdx !== -1 && (nextOpenIdx === -1 || closeIdx < nextOpenIdx)) {
      endIdx = closeIdx;
    } else if (nextOpenIdx !== -1) {
      endIdx = nextOpenIdx;
    } else {
      endIdx = content.length;
    }

    blocks.push(content.substring(startIdx, endIdx));
    searchFrom = endIdx;
    if (closeIdx !== -1 && closeIdx === endIdx) {
      searchFrom = closeIdx + "</STMTTRN>".length;
    }
  }

  return blocks;
}

/**
 * Parse a single STMTTRN block into an OFXTransaction.
 */
function parseTransactionBlock(block: string): OFXTransaction | null {
  const trnType = extractTagValue(block, "TRNTYPE");
  const dtPosted = extractTagValue(block, "DTPOSTED");
  const trnAmt = extractTagValue(block, "TRNAMT");
  const fitId = extractTagValue(block, "FITID");

  if (!trnType || !dtPosted || !trnAmt || !fitId) return null;

  return {
    TRNTYPE: trnType,
    DTPOSTED: dtPosted,
    TRNAMT: trnAmt,
    FITID: fitId,
    NAME: extractTagValue(block, "NAME"),
    MEMO: extractTagValue(block, "MEMO"),
    CHECKNUM: extractTagValue(block, "CHECKNUM"),
  };
}

/**
 * Determine transaction type from OFX TRNTYPE and amount.
 */
function determineTransactionType(trnType: string, amount: number): "credit" | "debit" {
  const upper = trnType.toUpperCase();
  // Credit types
  if (upper === "CREDIT" || upper === "DEP" || upper === "DIRECTDEP" || upper === "INT") {
    return "credit";
  }
  // Debit types
  if (
    upper === "DEBIT" ||
    upper === "CHECK" ||
    upper === "ATM" ||
    upper === "POS" ||
    upper === "XFER" ||
    upper === "FEE" ||
    upper === "SRVCHG" ||
    upper === "PAYMENT"
  ) {
    return "debit";
  }
  // Fall back to sign of amount
  return amount >= 0 ? "credit" : "debit";
}

/**
 * Parse OFX/QFX content into an array of ParsedTransaction objects.
 */
export function parseOFX(content: string): ParsedTransaction[] {
  if (!content || !content.trim()) return [];

  const blocks = extractTransactionBlocks(content);
  const transactions: ParsedTransaction[] = [];

  for (const block of blocks) {
    const ofxTxn = parseTransactionBlock(block);
    if (!ofxTxn) continue;

    const date = parseOFXDate(ofxTxn.DTPOSTED);
    if (!date) continue;

    const amount = parseFloat(ofxTxn.TRNAMT);
    if (isNaN(amount)) continue;

    // Use NAME, fall back to MEMO, then CHECKNUM-based description
    const description =
      ofxTxn.NAME ||
      ofxTxn.MEMO ||
      (ofxTxn.CHECKNUM ? `Check #${ofxTxn.CHECKNUM}` : "Unknown");

    const type = determineTransactionType(ofxTxn.TRNTYPE, amount);

    transactions.push({
      date,
      description: description.trim(),
      amount: Math.abs(amount),
      type,
      referenceId: ofxTxn.FITID,
    });
  }

  return transactions;
}
