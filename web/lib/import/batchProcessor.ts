/**
 * Background batch processor for imported bank statements.
 * Processes each file in an ImportBatch sequentially: parse, dedup, store.
 * Runs pattern detection after all files complete.
 */

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging";
import { parseCSV } from "./csvParser";
import { parseOFX } from "./ofxParser";
import { parsePDF } from "./pdfParser";
import { deduplicateTransactions, generateFingerprint } from "./dedup";
import { detectPatterns } from "@/lib/patterns/detect";
import type { ParsedTransaction } from "./csvParser";
import type { ExistingTransaction, FlaggedTransaction } from "./dedup";
import type { ExistingPattern } from "@/lib/patterns/detect";
import type { TransactionRecord } from "@/lib/patterns/vendorMatch";
import type { ImportFormat } from "@/app/generated/prisma/client";

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

/**
 * Process all pending files in an import batch.
 * Called via Next.js after() to run in the background after HTTP response.
 */
export async function processImportBatch(batchId: string, userId: string): Promise<void> {
  try {
    // Mark batch as processing
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { status: "processing", startedAt: new Date() },
    });

    // Fetch all existing user transactions once for dedup
    const existingRecords = await prisma.transaction.findMany({
      where: { userId },
      select: {
        referenceId: true,
        fingerprint: true,
        date: true,
        amount: true,
        description: true,
      },
    });

    const existingTransactions: ExistingTransaction[] = existingRecords.map((t) => ({
      referenceId: t.referenceId,
      fingerprint: t.fingerprint,
      date: t.date,
      amount: t.amount,
      description: t.description,
    }));

    // Track transactions imported within this batch for cross-file dedup
    const batchImported: ExistingTransaction[] = [];

    // Process each pending file in order
    const files = await prisma.importFile.findMany({
      where: { batchId, status: "pending" },
      orderBy: { position: "asc" },
    });

    for (const file of files) {
      try {
        // Mark file as processing
        await prisma.importFile.update({
          where: { id: file.id },
          data: { status: "processing" },
        });

        // Parse transactions from file data
        let parsed: ParsedTransaction[] = [];
        let lowConfidenceTransactions: ParsedTransaction[] = [];

        if (!file.fileData) {
          throw new Error("file data is missing");
        }

        if (file.format === "pdf") {
          const buffer = Buffer.from(file.fileData);
          const pdfResult = await parsePDF(buffer);
          parsed = pdfResult.transactions;
          lowConfidenceTransactions = pdfResult.lowConfidenceTransactions;
        } else {
          const content = Buffer.from(file.fileData).toString("utf-8");
          parsed = parseTextFile(content, file.format);
        }

        const allParsed = [...parsed, ...lowConfidenceTransactions];

        // Dedup against existing + previously imported in this batch
        const allExisting = [...existingTransactions, ...batchImported];
        const dedupResult = deduplicateTransactions(parsed, allExisting);

        const lowConfDedup = lowConfidenceTransactions.length > 0
          ? deduplicateTransactions(lowConfidenceTransactions, allExisting)
          : { newTransactions: [], skipped: [], flagged: [] };

        // Low-confidence new transactions flagged for user review
        const lowConfFlagged = lowConfDedup.newTransactions.map((txn) => ({
          transaction: txn,
          matchedExisting: null,
          reason: "low confidence — AI was uncertain about this transaction's data",
        }));

        // Store new transactions and create import log
        const importLog = await prisma.$transaction(async (tx) => {
          if (dedupResult.newTransactions.length > 0) {
            await tx.transaction.createMany({
              data: dedupResult.newTransactions.map((txn) => ({
                userId,
                date: txn.date,
                description: txn.description,
                amount: txn.amount,
                type: txn.type,
                referenceId: txn.referenceId,
                fingerprint: generateFingerprint(txn),
                sourceFileName: file.fileName,
              })),
            });
          }

          const totalFlagged =
            dedupResult.flagged.length +
            lowConfFlagged.length +
            lowConfDedup.flagged.length;

          const log = await tx.importLog.create({
            data: {
              userId,
              fileName: file.fileName,
              format: file.format,
              transactionsFound: allParsed.length,
              transactionsImported: dedupResult.newTransactions.length,
              duplicatesSkipped: dedupResult.skipped.length + lowConfDedup.skipped.length,
              duplicatesFlagged: totalFlagged,
            },
          });

          return log;
        });

        // Combine all flagged items for serialization
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

        // Add newly imported transactions to batch dedup pool
        for (const txn of dedupResult.newTransactions) {
          batchImported.push({
            referenceId: txn.referenceId,
            fingerprint: generateFingerprint(txn),
            date: txn.date,
            amount: txn.amount,
            description: txn.description,
          });
        }

        // Update file record
        await prisma.importFile.update({
          where: { id: file.id },
          data: {
            status: "completed",
            transactionsFound: allParsed.length,
            transactionsImported: dedupResult.newTransactions.length,
            duplicatesSkipped: dedupResult.skipped.length + lowConfDedup.skipped.length,
            duplicatesFlagged: allFlagged.length,
            flaggedData: allFlagged.length > 0 ? JSON.parse(JSON.stringify(allFlagged)) : undefined,
            importLogId: importLog.id,
            processedAt: new Date(),
          },
        });

        // Update batch running totals
        await prisma.importBatch.update({
          where: { id: batchId },
          data: {
            filesCompleted: { increment: 1 },
            totalTransactionsFound: { increment: allParsed.length },
            totalTransactionsImported: { increment: dedupResult.newTransactions.length },
            totalDuplicatesSkipped: {
              increment: dedupResult.skipped.length + lowConfDedup.skipped.length,
            },
            totalDuplicatesFlagged: { increment: allFlagged.length },
          },
        });
      } catch (fileError) {
        logError(`failed to process import file ${file.fileName}`, fileError);

        await prisma.importFile.update({
          where: { id: file.id },
          data: {
            status: "failed",
            errorMessage: fileError instanceof Error ? fileError.message : "unknown error",
          },
        });

        // Still increment filesCompleted so progress reflects this file was attempted
        await prisma.importBatch.update({
          where: { id: batchId },
          data: { filesCompleted: { increment: 1 } },
        });
      }
    }

    // Run pattern detection
    try {
      await runPatternDetection(userId);
    } catch (patternError) {
      logError("pattern detection failed during batch processing", patternError);
    }

    // Mark batch complete and clean up file data
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: "completed",
        patternDetectionComplete: true,
        completedAt: new Date(),
      },
    });

    // Delete raw file bytes from completed files
    await prisma.importFile.updateMany({
      where: { batchId, status: "completed" },
      data: { fileData: null },
    });
  } catch (error) {
    logError("batch processing failed", error);

    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "unknown error",
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Run pattern detection and create suggestions, mirroring the logic
 * in /api/patterns/detect but callable from the batch processor.
 */
async function runPatternDetection(userId: string): Promise<void> {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      type: true,
    },
    orderBy: { date: "asc" },
  });

  const transactionRecords: TransactionRecord[] = transactions.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    type: t.type as "credit" | "debit",
  }));

  const [incomeSources, obligations] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId, isActive: true },
      select: { name: true, expectedAmount: true },
    }),
    prisma.obligation.findMany({
      where: { userId, isActive: true },
      select: { name: true, amount: true },
    }),
  ]);

  const existingPatterns: ExistingPattern[] = [
    ...incomeSources.map((s) => ({
      name: s.name,
      amount: s.expectedAmount,
      type: "income" as const,
    })),
    ...obligations.map((o) => ({
      name: o.name,
      amount: o.amount,
      type: "expense" as const,
    })),
  ];

  const detectedPatterns = detectPatterns(transactionRecords, existingPatterns);

  const existingSuggestions = await prisma.suggestion.findMany({
    where: { userId, status: "pending" },
    select: { vendorPattern: true },
  });
  const existingVendorPatterns = new Set(
    existingSuggestions.map((s) => s.vendorPattern)
  );

  const newPatterns = detectedPatterns.filter(
    (p) => !existingVendorPatterns.has(p.vendorPattern)
  );

  if (newPatterns.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const pattern of newPatterns) {
        const suggestion = await tx.suggestion.create({
          data: {
            userId,
            type: pattern.type,
            vendorPattern: pattern.vendorPattern,
            detectedAmount: pattern.detectedAmount,
            detectedAmountMin: pattern.detectedAmountMin,
            detectedAmountMax: pattern.detectedAmountMax,
            detectedIntervalUnit: pattern.detectedIntervalUnit,
            detectedIntervalCount: pattern.detectedIntervalCount,
            confidence: pattern.confidence,
            matchingTransactionCount: pattern.matchingTransactionCount,
          },
        });

        if (pattern.transactionIds.length > 0) {
          await tx.suggestionTransaction.createMany({
            data: pattern.transactionIds.map((transactionId) => ({
              suggestionId: suggestion.id,
              transactionId,
            })),
          });
        }
      }
    });
  }
}
