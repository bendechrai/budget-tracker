import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { resolveCycleConfig } from "@/lib/engine/calculate";
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

    const totalFundBalance = fundGroups.reduce(
      (sum, fg) => sum + fg.currentBalance,
      0
    );

    const timeline = projectTimeline({
      obligations: obligationInputs,
      fundGroupBalances: fundGroupBalanceInputs,
      currentFundBalance: totalFundBalance,
      cycleConfig,
      monthsAhead,
    });

    // Preseed = how far the balance drops from its starting point to its lowest point.
    // This represents the portion of the fund that's "spoken for" as a timing buffer.
    const totalPreseed = Math.max(0, totalFundBalance - timeline.minProjectedBalance);

    // Distribute preseed proportionally to fund groups by obligation amount share
    const groupExpenseTotal = new Map<string, number>();
    let allExpenseTotal = 0;
    for (const o of obligationInputs) {
      if (!o.fundGroupId) continue;
      groupExpenseTotal.set(
        o.fundGroupId,
        (groupExpenseTotal.get(o.fundGroupId) ?? 0) + o.amount,
      );
      allExpenseTotal += o.amount;
    }

    const fundGroupPreseeds: Record<string, number> = {};
    for (const fg of fundGroups) {
      if (allExpenseTotal <= 0 || totalPreseed <= 0) {
        fundGroupPreseeds[fg.id] = 0;
        continue;
      }
      const share = groupExpenseTotal.get(fg.id) ?? 0;
      fundGroupPreseeds[fg.id] =
        Math.round((totalPreseed * share / allExpenseTotal) * 100) / 100;
    }

    return NextResponse.json({ ...timeline, fundGroupPreseeds });
  } catch (error) {
    logError("failed to generate timeline projection", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
