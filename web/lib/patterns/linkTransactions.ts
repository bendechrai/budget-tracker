/**
 * Prisma-dependent orchestration for linking transactions to obligations.
 * Calls the pure matcher from matchObligation.ts.
 */

import { prisma } from "@/lib/prisma";
import { matchTransactionsToObligations } from "./matchObligation";
import type { MatchableObligation } from "./matchObligation";

/**
 * Link newly imported transactions to existing obligations.
 * Queries debit transactions imported since `since` that have no obligation link,
 * matches them against active obligations, and batch-updates the links.
 */
export async function linkNewTransactionsToObligations(
  userId: string,
  since: Date
): Promise<number> {
  const [transactions, obligations] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        obligationId: null,
        type: "debit",
        importedAt: { gte: since },
      },
      select: { id: true, description: true, amount: true, type: true },
    }),
    prisma.obligation.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, amount: true },
    }),
  ]);

  if (transactions.length === 0 || obligations.length === 0) return 0;

  const matchableObligations: MatchableObligation[] = obligations.map((o) => ({
    id: o.id,
    name: o.name,
    amount: o.amount,
  }));

  const matches = matchTransactionsToObligations(
    transactions.map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      type: t.type as "credit" | "debit",
    })),
    matchableObligations
  );

  if (matches.size === 0) return 0;

  // Batch update in a transaction
  await prisma.$transaction(
    [...matches.entries()].map(([transactionId, obligationId]) =>
      prisma.transaction.update({
        where: { id: transactionId },
        data: { obligationId },
      })
    )
  );

  return matches.size;
}

/**
 * Link unlinked debit transactions to a specific obligation.
 * Used when a new obligation is created — matches existing transactions
 * that may have been imported before the obligation existed.
 */
export async function linkExistingTransactionsToObligation(
  userId: string,
  obligation: { id: string; name: string; amount: number }
): Promise<number> {
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      obligationId: null,
      type: "debit",
    },
    select: { id: true, description: true, amount: true, type: true },
  });

  if (transactions.length === 0) return 0;

  const matches = matchTransactionsToObligations(
    transactions.map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      type: t.type as "credit" | "debit",
    })),
    [{ id: obligation.id, name: obligation.name, amount: obligation.amount }]
  );

  if (matches.size === 0) return 0;

  await prisma.$transaction(
    [...matches.entries()].map(([transactionId, obligationId]) =>
      prisma.transaction.update({
        where: { id: transactionId },
        data: { obligationId },
      })
    )
  );

  return matches.size;
}
