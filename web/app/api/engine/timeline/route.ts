import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateContributions, resolveCycleConfig } from "@/lib/engine/calculate";
import { projectTimeline } from "@/lib/engine/timeline";
import type { ObligationInput, FundGroupBalanceInput } from "@/lib/engine/calculate";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const monthsAhead = Math.max(
      1,
      Math.min(12, parseInt(searchParams.get("months") ?? "6", 10) || 6)
    );

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

    const fundGroups = await prisma.fundGroup.findMany({
      where: { userId: user.id },
    });

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

    const engineResult = calculateContributions({
      obligations: obligationInputs,
      fundGroupBalances: fundGroupBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      cycleConfig,
    });

    const timeline = projectTimeline({
      obligations: obligationInputs,
      fundGroupBalances: fundGroupBalanceInputs,
      currentFundBalance: user.currentFundBalance,
      contributionPerCycle: engineResult.totalContributionPerCycle,
      cycleConfig,
      monthsAhead,
    });

    return NextResponse.json(timeline);
  } catch (error) {
    logError("failed to generate timeline projection", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
