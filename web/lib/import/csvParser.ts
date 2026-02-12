/**
 * CSV statement parser utility.
 * Auto-detects common bank CSV column layouts and parses transactions.
 */

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: "credit" | "debit";
  referenceId: string | null;
}

export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  /** If set, credit/debit are in separate columns instead of a single signed amount. */
  creditAmount?: number;
  debitAmount?: number;
  /** If set, this column holds the transaction type label (e.g. "credit"/"debit"). */
  typeColumn?: number;
  referenceId?: number;
}

interface DetectedLayout {
  mapping: ColumnMapping;
  hasHeader: boolean;
}

const DATE_PATTERNS: RegExp[] = [
  // DD/MM/YYYY or DD-MM-YYYY
  /^\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}$/,
  // YYYY-MM-DD or YYYY/MM/DD
  /^\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}$/,
  // MM/DD/YYYY
  /^\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4}$/,
];

const DATE_HEADER_NAMES = ["date", "transaction date", "trans date", "posted", "posting date", "value date"];
const DESC_HEADER_NAMES = ["description", "memo", "details", "narrative", "transaction", "particulars", "reference", "payee"];
const AMOUNT_HEADER_NAMES = ["amount", "value", "sum", "total"];
const CREDIT_HEADER_NAMES = ["credit", "credits", "deposit", "deposits", "money in"];
const DEBIT_HEADER_NAMES = ["debit", "debits", "withdrawal", "withdrawals", "money out"];
const TYPE_HEADER_NAMES = ["type", "transaction type", "trans type", "dr/cr", "dc"];
const REF_HEADER_NAMES = ["reference", "ref", "reference no", "ref no", "transaction id", "trans id", "check", "cheque"];

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function looksLikeDate(value: string): boolean {
  return DATE_PATTERNS.some((p) => p.test(value.trim()));
}

function looksLikeAmount(value: string): boolean {
  const cleaned = value.replace(/[$£€,\s]/g, "").replace(/^\((.+)\)$/, "-$1");
  return /^-?\d+(\.\d+)?$/.test(cleaned);
}

function findHeaderIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const name of names) {
    const idx = normalized.indexOf(name);
    if (idx !== -1) return idx;
  }
  // Partial match
  for (const name of names) {
    const idx = normalized.findIndex((h) => h.includes(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectFromHeaders(headers: string[]): ColumnMapping | null {
  const dateIdx = findHeaderIndex(headers, DATE_HEADER_NAMES);
  const descIdx = findHeaderIndex(headers, DESC_HEADER_NAMES);
  const amountIdx = findHeaderIndex(headers, AMOUNT_HEADER_NAMES);
  const creditIdx = findHeaderIndex(headers, CREDIT_HEADER_NAMES);
  const debitIdx = findHeaderIndex(headers, DEBIT_HEADER_NAMES);
  const typeIdx = findHeaderIndex(headers, TYPE_HEADER_NAMES);
  const refIdx = findHeaderIndex(headers, REF_HEADER_NAMES);

  if (dateIdx === -1 || descIdx === -1) return null;

  // Need either a single amount column or separate credit/debit columns
  if (amountIdx === -1 && (creditIdx === -1 || debitIdx === -1)) return null;

  const mapping: ColumnMapping = {
    date: dateIdx,
    description: descIdx,
    amount: amountIdx !== -1 ? amountIdx : creditIdx,
  };

  if (creditIdx !== -1 && debitIdx !== -1) {
    mapping.creditAmount = creditIdx;
    mapping.debitAmount = debitIdx;
  }

  if (typeIdx !== -1) {
    mapping.typeColumn = typeIdx;
  }

  if (refIdx !== -1 && refIdx !== descIdx) {
    mapping.referenceId = refIdx;
  }

  return mapping;
}

function detectFromData(rows: string[][]): ColumnMapping | null {
  if (rows.length === 0) return null;

  const colCount = rows[0].length;
  if (colCount < 2) return null;

  let dateCol = -1;
  const amountCols: number[] = [];

  for (let col = 0; col < colCount; col++) {
    const dateMatches = rows.filter((r) => r[col] && looksLikeDate(r[col])).length;
    const amountMatches = rows.filter((r) => r[col] && looksLikeAmount(r[col])).length;

    if (dateMatches >= rows.length * 0.7 && dateCol === -1) {
      dateCol = col;
    }
    if (amountMatches >= rows.length * 0.7) {
      amountCols.push(col);
    }
  }

  if (dateCol === -1 || amountCols.length === 0) return null;

  // Find description column: longest average string length that isn't date or amount
  const usedCols = new Set([dateCol, ...amountCols]);
  let descCol = -1;
  let maxAvgLen = 0;

  for (let col = 0; col < colCount; col++) {
    if (usedCols.has(col)) continue;
    const avgLen = rows.reduce((sum, r) => sum + (r[col]?.length ?? 0), 0) / rows.length;
    if (avgLen > maxAvgLen) {
      maxAvgLen = avgLen;
      descCol = col;
    }
  }

  if (descCol === -1) return null;

  const mapping: ColumnMapping = {
    date: dateCol,
    description: descCol,
    amount: amountCols[0],
  };

  // If two amount columns, treat as credit/debit
  if (amountCols.length === 2) {
    mapping.creditAmount = amountCols[0];
    mapping.debitAmount = amountCols[1];
  }

  return mapping;
}

function detectLayout(lines: string[]): DetectedLayout | null {
  if (lines.length === 0) return null;

  const firstRow = parseCSVLine(lines[0]);

  // Check if first row looks like a header
  const headerMapping = detectFromHeaders(firstRow);
  if (headerMapping) {
    return { mapping: headerMapping, hasHeader: true };
  }

  // Try data-based detection
  const allRows = lines.map(parseCSVLine);
  const dataMapping = detectFromData(allRows);
  if (dataMapping) {
    return { mapping: dataMapping, hasHeader: false };
  }

  return null;
}

/**
 * Parse a date string into a Date object.
 * Handles DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY formats.
 */
export function parseDate(value: string): Date | null {
  const trimmed = value.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or DD-MM-YYYY (day > 12 confirms DD/MM format)
  // MM/DD/YYYY (month > 12 is impossible, so first > 12 means it must be DD)
  const slashMatch = trimmed.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;

    // If first > 12, it must be day (DD/MM/YYYY)
    if (first > 12) {
      const d = new Date(year, second - 1, first);
      if (!isNaN(d.getTime())) return d;
    }
    // If second > 12, first must be month (MM/DD/YYYY)
    if (second > 12) {
      const d = new Date(year, first - 1, second);
      if (!isNaN(d.getTime())) return d;
    }
    // Ambiguous — default to DD/MM/YYYY (more common internationally)
    const d = new Date(year, second - 1, first);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function parseAmount(value: string): number | null {
  if (!value || !value.trim()) return null;
  // Remove currency symbols, commas, whitespace
  let cleaned = value.replace(/[$£€,\s]/g, "");
  // Handle parenthetical negatives: (100.00) -> -100.00
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) {
    cleaned = "-" + parenMatch[1];
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function determineType(
  row: string[],
  mapping: ColumnMapping,
  amount: number
): "credit" | "debit" {
  // Check explicit type column
  if (mapping.typeColumn !== undefined) {
    const typeVal = (row[mapping.typeColumn] ?? "").toLowerCase().trim();
    if (typeVal.includes("credit") || typeVal === "cr" || typeVal === "c") return "credit";
    if (typeVal.includes("debit") || typeVal === "dr" || typeVal === "d") return "debit";
  }

  // Check separate credit/debit columns
  if (mapping.creditAmount !== undefined && mapping.debitAmount !== undefined) {
    const creditVal = parseAmount(row[mapping.creditAmount]);
    if (creditVal !== null && creditVal > 0) return "credit";
    return "debit";
  }

  // Sign-based: positive = credit, negative = debit
  return amount >= 0 ? "credit" : "debit";
}

/**
 * Parse CSV content into an array of ParsedTransaction objects.
 * Auto-detects column layout or uses a provided mapping.
 */
export function parseCSV(
  content: string,
  manualMapping?: ColumnMapping
): ParsedTransaction[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  let mapping: ColumnMapping;
  let dataStartIndex: number;

  if (manualMapping) {
    mapping = manualMapping;
    // With manual mapping, try to detect if first row is a header
    const firstRowFields = parseCSVLine(lines[0]);
    const firstFieldIsDate = looksLikeDate(firstRowFields[mapping.date] ?? "");
    dataStartIndex = firstFieldIsDate ? 0 : 1;
  } else {
    const detected = detectLayout(lines);
    if (!detected) return [];
    mapping = detected.mapping;
    dataStartIndex = detected.hasHeader ? 1 : 0;
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = dataStartIndex; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);

    const dateStr = fields[mapping.date];
    const descStr = fields[mapping.description];

    if (!dateStr || !descStr) continue;

    const date = parseDate(dateStr);
    if (!date) continue;

    let amount: number;
    if (mapping.creditAmount !== undefined && mapping.debitAmount !== undefined) {
      const credit = parseAmount(fields[mapping.creditAmount]) ?? 0;
      const debit = parseAmount(fields[mapping.debitAmount]) ?? 0;
      amount = credit > 0 ? credit : -Math.abs(debit);
    } else {
      const parsed = parseAmount(fields[mapping.amount]);
      if (parsed === null) continue;
      amount = parsed;
    }

    const type = determineType(fields, mapping, amount);
    const referenceId =
      mapping.referenceId !== undefined
        ? fields[mapping.referenceId]?.trim() || null
        : null;

    transactions.push({
      date,
      description: descStr.trim(),
      amount: Math.abs(amount),
      type,
      referenceId,
    });
  }

  return transactions;
}
