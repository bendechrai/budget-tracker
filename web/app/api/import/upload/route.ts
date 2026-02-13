import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { parseCSV } from "@/lib/import/csvParser";
import { parseOFX } from "@/lib/import/ofxParser";
import { parsePDF } from "@/lib/import/pdfParser";
import {
  deduplicateTransactions,
  generateFingerprint,
} from "@/lib/import/dedup";
import type { ParsedTransaction } from "@/lib/import/csvParser";
import type { ExistingTransaction, FlaggedTransaction } from "@/lib/import/dedup";
import type { ImportFormat } from "@/app/generated/prisma/client";

/** Supported file extensions and their corresponding import format. */
const FORMAT_MAP: Record<string, ImportFormat> = {
  ".csv": "csv",
  ".ofx": "ofx",
  ".qfx": "ofx",
  ".pdf": "pdf",
};

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot).toLowerCase();
}

function parseTextFile(content: string, format: ImportFormat): ParsedTransaction[] {
  switch (format) {
    case "csv":
      return parseCSV(content);
    case "ofx":
      return parseOFX(content);
    default:
      return [];
  }
}

interface ImportSummary {
  fileName: string;
  format: ImportFormat;
  transactionsFound: number;
  transactionsImported: number;
  duplicatesSkipped: number;
  duplicatesFlagged: number;
  flagged: Array<{
    transaction: ParsedTransaction;
    matchedExisting: ExistingTransaction | null;
    reason: string;
  }>;
  importLogId: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    const blob = file as File;

    if (blob.size === 0) {
      return NextResponse.json(
        { error: "file is empty" },
        { status: 400 }
      );
    }

    const fileName = blob.name;
    const ext = getFileExtension(fileName);
    const format = FORMAT_MAP[ext];

    if (!format) {
      return NextResponse.json(
        {
          error:
            "unsupported file format. Supported formats: PDF (.pdf), CSV (.csv), OFX (.ofx, .qfx)",
        },
        { status: 400 }
      );
    }

    // Parse transactions from file
    let parsed: ParsedTransaction[];
    let lowConfidenceTransactions: ParsedTransaction[] = [];

    if (format === "pdf") {
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfResult = await parsePDF(buffer);
      parsed = pdfResult.transactions;
      lowConfidenceTransactions = pdfResult.lowConfidenceTransactions;
    } else {
      const content = await blob.text();
      parsed = parseTextFile(content, format);
    }

    // Combine high and low confidence for total count
    const allParsed = [...parsed, ...lowConfidenceTransactions];

    if (allParsed.length === 0) {
      return NextResponse.json(
        { error: "no transactions found in file" },
        { status: 400 }
      );
    }

    // Fetch existing transactions for dedup
    const existingRecords = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: {
        referenceId: true,
        fingerprint: true,
        date: true,
        amount: true,
        description: true,
      },
    });

    const existing: ExistingTransaction[] = existingRecords.map((t) => ({
      referenceId: t.referenceId,
      fingerprint: t.fingerprint,
      date: t.date,
      amount: t.amount,
      description: t.description,
    }));

    // Run deduplication on high-confidence transactions
    const dedupResult = deduplicateTransactions(parsed, existing);

    // Also dedup low-confidence transactions (they may also be duplicates)
    const lowConfDedup = lowConfidenceTransactions.length > 0
      ? deduplicateTransactions(lowConfidenceTransactions, existing)
      : { newTransactions: [], skipped: [], flagged: [] };

    // Low-confidence new transactions are flagged for user review instead of auto-imported
    const lowConfFlagged = lowConfDedup.newTransactions.map((txn) => ({
      transaction: txn,
      matchedExisting: null,
      reason: "low confidence — AI was uncertain about this transaction's data",
    }));

    // Save new (high-confidence) transactions and create import log
    const importLog = await prisma.$transaction(async (tx) => {
      if (dedupResult.newTransactions.length > 0) {
        await tx.transaction.createMany({
          data: dedupResult.newTransactions.map((txn) => ({
            userId: user.id,
            date: txn.date,
            description: txn.description,
            amount: txn.amount,
            type: txn.type,
            referenceId: txn.referenceId,
            fingerprint: generateFingerprint(txn),
            sourceFileName: fileName,
          })),
        });
      }

      const totalFlagged =
        dedupResult.flagged.length +
        lowConfFlagged.length +
        lowConfDedup.flagged.length;

      const log = await tx.importLog.create({
        data: {
          userId: user.id,
          fileName,
          format,
          transactionsFound: allParsed.length,
          transactionsImported: dedupResult.newTransactions.length,
          duplicatesSkipped:
            dedupResult.skipped.length + lowConfDedup.skipped.length,
          duplicatesFlagged: totalFlagged,
        },
      });

      return log;
    });

    // Combine all flagged items: dedup fuzzy matches + low-confidence transactions
    const allFlagged = [
      ...dedupResult.flagged.map((f: FlaggedTransaction) => ({
        transaction: f.transaction,
        matchedExisting: f.matchedExisting as ExistingTransaction | null,
        reason: f.reason,
      })),
      ...lowConfDedup.flagged.map((f: FlaggedTransaction) => ({
        transaction: f.transaction,
        matchedExisting: f.matchedExisting as ExistingTransaction | null,
        reason: f.reason,
      })),
      ...lowConfFlagged,
    ];

    const summary: ImportSummary = {
      fileName,
      format,
      transactionsFound: allParsed.length,
      transactionsImported: dedupResult.newTransactions.length,
      duplicatesSkipped:
        dedupResult.skipped.length + lowConfDedup.skipped.length,
      duplicatesFlagged: allFlagged.length,
      flagged: allFlagged,
      importLogId: importLog.id,
    };

    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    logError("failed to process import upload", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
