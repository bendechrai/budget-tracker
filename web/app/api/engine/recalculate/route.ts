import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import { applyPendingEscalations } from "@/lib/engine/applyEscalations";
import { calculateSteadyStatePerCycle } from "@/lib/engine/timeline";
import type { ObligationInput, FundGroupBalanceInput } from "@/lib/engine/calculate";
import { resolveCycleConfig } from "@/lib/engine/calculate";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Apply any pending one-off escalation rules before recalculating
    await applyPendingEscalations(user.id);

    // Fetch active income sources for cycle auto-detection
    const incomeSources = await prisma.incomeSource.findMany({
      where: { userId: user.id, isActive: true },
      select: { intervalUnit: true, intervalCount: true, isActive: true, isPaused: true },
    });

    // Resolve cycle config: explicit user setting > auto-detect from income > monthly default
    const cycleConfig = resolveCycleConfig(
      {
        contributionCycleType: user.contributionCycleType ?? null,
        contributionPayDays: user.contributionPayDays ?? [],
      },
      incomeSources,
    );

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

    // Fetch fund group balances
    const fundGroups = await prisma.fundGroup.findMany({
      where: { userId: user.id },
    });

    // Map to engine input types
    const obligationInputs: ObligationInput[] = obligations.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      amount: o.amount,
      intervalUnit: o.intervalUnit,
      intervalCount: o.intervalCount,
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

    const fundGroupBalanceInputs: FundGroupBalanceInput[] = fundGroups.map((fg) => ({
      fundGroupId: fg.id,
      name: fg.name,
      currentBalance: fg.currentBalance,
    }));

    // Run engine calculation and generate snapshot
    const { snapshot } = calculateAndSnapshot({
      obligations: obligationInputs,
      fundGroupBalances: fundGroupBalanceInputs,
      cycleConfig,
    });

    // Persist the snapshot (core fields only — computed per-cycle fields are ephemeral)
    const saved = await prisma.engineSnapshot.create({
      data: {
        userId: user.id,
        totalRequired: snapshot.totalRequired,
        totalFunded: snapshot.totalFunded,
        nextActionAmount: snapshot.nextActionAmount,
        nextActionDate: snapshot.nextActionDate,
        nextActionDescription: snapshot.nextActionDescription,
        nextActionObligationId: snapshot.nextActionObligationId,
        nextActionFundGroupId: snapshot.nextActionFundGroupId,
      },
    });

    // Calculate steady-state per-cycle contribution (total expenses / cycles)
    const steadyStatePerCycle = calculateSteadyStatePerCycle({
      obligations: obligationInputs,
      cycleConfig,
    });

    // Return persisted snapshot augmented with computed per-cycle fields
    return NextResponse.json({
      ...saved,
      totalContributionPerCycle: steadyStatePerCycle,
      cyclePeriodLabel: snapshot.cyclePeriodLabel,
    });
  } catch (error) {
    logError("failed to recalculate engine", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
