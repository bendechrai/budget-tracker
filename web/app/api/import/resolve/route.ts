import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { generateFingerprint } from "@/lib/import/dedup";
import type { ParsedTransaction } from "@/lib/import/csvParser";

interface ResolveDecision {
  /** The flagged transaction data. */
  transaction: ParsedTransaction;
  /** User decision: "keep" saves the transaction, "skip" discards it. */
  action: "keep" | "skip";
}

interface ResolveRequest {
  importLogId: string;
  decisions: ResolveDecision[];
}

function isValidDecision(d: unknown): d is ResolveDecision {
  if (typeof d !== "object" || d === null) return false;
  const obj = d as Record<string, unknown>;
  if (obj.action !== "keep" && obj.action !== "skip") return false;
  if (typeof obj.transaction !== "object" || obj.transaction === null)
    return false;
  const txn = obj.transaction as Record<string, unknown>;
  if (typeof txn.description !== "string") return false;
  if (typeof txn.amount !== "number") return false;
  if (typeof txn.type !== "string") return false;
  if (txn.type !== "credit" && txn.type !== "debit") return false;
  // date can be a string (from JSON) — we parse it later
  if (!txn.date) return false;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<ResolveRequest>;

    if (!body.importLogId || typeof body.importLogId !== "string") {
      return NextResponse.json(
        { error: "importLogId is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.decisions) || body.decisions.length === 0) {
      return NextResponse.json(
        { error: "decisions array is required and must not be empty" },
        { status: 400 }
      );
    }

    for (const d of body.decisions) {
      if (!isValidDecision(d)) {
        return NextResponse.json(
          { error: "each decision must have a valid transaction and action (keep or skip)" },
          { status: 400 }
        );
      }
    }

    // Verify the import log belongs to this user
    const importLog = await prisma.importLog.findFirst({
      where: { id: body.importLogId, userId: user.id },
    });

    if (!importLog) {
      return NextResponse.json(
        { error: "import log not found" },
        { status: 404 }
      );
    }

    const decisions = body.decisions as ResolveDecision[];
    const kept = decisions.filter((d) => d.action === "keep");
    const skipped = decisions.filter((d) => d.action === "skip");

    // Save kept transactions and update import log in a single db transaction
    await prisma.$transaction(async (tx) => {
      if (kept.length > 0) {
        await tx.transaction.createMany({
          data: kept.map((d) => {
            const txn: ParsedTransaction = {
              date: new Date(d.transaction.date),
              description: d.transaction.description,
              amount: d.transaction.amount,
              type: d.transaction.type as "credit" | "debit",
              referenceId: d.transaction.referenceId ?? null,
            };
            return {
              userId: user.id,
              date: txn.date,
              description: txn.description,
              amount: txn.amount,
              type: txn.type,
              referenceId: txn.referenceId,
              fingerprint: generateFingerprint(txn),
              sourceFileName: importLog.fileName,
            };
          }),
        });
      }

      // Update import log: add kept to imported count, move flagged to skipped for skipped ones
      await tx.importLog.update({
        where: { id: importLog.id },
        data: {
          transactionsImported: { increment: kept.length },
          duplicatesSkipped: { increment: skipped.length },
          duplicatesFlagged: { increment: -decisions.length },
        },
      });
    });

    return NextResponse.json(
      {
        resolved: decisions.length,
        kept: kept.length,
        skipped: skipped.length,
      },
      { status: 200 }
    );
  } catch (error) {
    logError("failed to resolve flagged transactions", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
