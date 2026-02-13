import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import { applyPendingEscalations } from "@/lib/engine/applyEscalations";
import type { ObligationInput, FundBalanceInput } from "@/lib/engine/calculate";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Apply any pending one-off escalation rules before recalculating
    await applyPendingEscalations(user.id);

    // Fetch active, non-archived obligations with their custom entries
    const obligations = await prisma.obligation.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
      include: {
        customEntries: true,
      },
    });

    // Fetch fund balances for all user obligations
    const fundBalances = await prisma.fundBalance.findMany({
      where: {
        obligation: {
          userId: user.id,
        },
      },
    });

    // Map to engine input types
    const obligationInputs: ObligationInput[] = obligations.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      amount: o.amount,
      frequency: o.frequency,
      frequencyDays: o.frequencyDays,
      nextDueDate: o.nextDueDate,
      endDate: o.endDate,
      isPaused: o.isPaused,
      isActive: o.isActive,
      fundGroupId: o.fundGroupId,
      customEntries: o.customEntries.map((e) => ({
        dueDate: e.dueDate,
        amount: e.amount,
        isPaid: e.isPaid,
      })),
    }));

    const fundBalanceInputs: FundBalanceInput[] = fundBalances.map((fb) => ({
      obligationId: fb.obligationId,
      currentBalance: fb.currentBalance,
    }));

    // Run engine calculation and generate snapshot
    const { snapshot } = calculateAndSnapshot({
      obligations: obligationInputs,
      fundBalances: fundBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      contributionCycleDays: user.contributionCycleDays,
    });

    // Persist the snapshot
    const saved = await prisma.engineSnapshot.create({
      data: {
        userId: user.id,
        totalRequired: snapshot.totalRequired,
        totalFunded: snapshot.totalFunded,
        nextActionAmount: snapshot.nextActionAmount,
        nextActionDate: snapshot.nextActionDate,
        nextActionDescription: snapshot.nextActionDescription,
      },
    });

    return NextResponse.json(saved);
  } catch (error) {
    logError("failed to recalculate engine", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
