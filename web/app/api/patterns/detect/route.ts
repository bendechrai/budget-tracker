import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging";
import { detectPatterns } from "@/lib/patterns/detect";
import type { ExistingPattern } from "@/lib/patterns/detect";
import type { TransactionRecord } from "@/lib/patterns/vendorMatch";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Fetch all user transactions for pattern analysis
    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
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

    // Build existing patterns from income sources and obligations
    const [incomeSources, obligations] = await Promise.all([
      prisma.incomeSource.findMany({
        where: { userId: user.id, isActive: true },
        select: { name: true, expectedAmount: true },
      }),
      prisma.obligation.findMany({
        where: { userId: user.id, isActive: true },
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

    // Run pattern detection
    const detectedPatterns = detectPatterns(transactionRecords, existingPatterns);

    // Also exclude patterns that already have pending suggestions
    const existingSuggestions = await prisma.suggestion.findMany({
      where: { userId: user.id, status: "pending" },
      select: { vendorPattern: true },
    });
    const existingVendorPatterns = new Set(
      existingSuggestions.map((s) => s.vendorPattern)
    );

    const newPatterns = detectedPatterns.filter(
      (p) => !existingVendorPatterns.has(p.vendorPattern)
    );

    // Create suggestions with linked transactions in a transaction
    let createdCount = 0;

    if (newPatterns.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const pattern of newPatterns) {
          const suggestion = await tx.suggestion.create({
            data: {
              userId: user.id,
              type: pattern.type,
              vendorPattern: pattern.vendorPattern,
              detectedAmount: pattern.detectedAmount,
              detectedAmountMin: pattern.detectedAmountMin,
              detectedAmountMax: pattern.detectedAmountMax,
              detectedFrequency: pattern.detectedFrequency,
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

          createdCount++;
        }
      });
    }

    return NextResponse.json({ newSuggestions: createdCount }, { status: 200 });
  } catch (error) {
    logError("failed to run pattern detection", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
