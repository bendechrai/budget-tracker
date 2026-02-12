import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { parseCSV } from "@/lib/import/csvParser";
import { parseOFX } from "@/lib/import/ofxParser";
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
};

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot).toLowerCase();
}

function parseFile(content: string, format: ImportFormat): ParsedTransaction[] {
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
    matchedExisting: ExistingTransaction;
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
            "unsupported file format. Supported formats: CSV (.csv), OFX (.ofx, .qfx)",
        },
        { status: 400 }
      );
    }

    // Read file content as text
    const content = await blob.text();

    // Parse transactions from file
    const parsed = parseFile(content, format);

    if (parsed.length === 0) {
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

    // Run deduplication
    const dedupResult = deduplicateTransactions(parsed, existing);

    // Save new transactions and create import log in a single transaction
    const importLog = await prisma.$transaction(async (tx) => {
      // Create all new transactions
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

      // Create import log
      const log = await tx.importLog.create({
        data: {
          userId: user.id,
          fileName,
          format,
          transactionsFound: parsed.length,
          transactionsImported: dedupResult.newTransactions.length,
          duplicatesSkipped: dedupResult.skipped.length,
          duplicatesFlagged: dedupResult.flagged.length,
        },
      });

      return log;
    });

    const summary: ImportSummary = {
      fileName,
      format,
      transactionsFound: parsed.length,
      transactionsImported: dedupResult.newTransactions.length,
      duplicatesSkipped: dedupResult.skipped.length,
      duplicatesFlagged: dedupResult.flagged.length,
      flagged: dedupResult.flagged.map((f: FlaggedTransaction) => ({
        transaction: f.transaction,
        matchedExisting: f.matchedExisting,
        reason: f.reason,
      })),
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
