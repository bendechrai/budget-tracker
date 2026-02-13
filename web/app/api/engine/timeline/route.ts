import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateContributions } from "@/lib/engine/calculate";
import { projectTimeline } from "@/lib/engine/timeline";
import type { ObligationInput, FundBalanceInput } from "@/lib/engine/calculate";

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

    const fundBalances = await prisma.fundBalance.findMany({
      where: {
        obligation: {
          userId: user.id,
        },
      },
    });

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

    const engineResult = calculateContributions({
      obligations: obligationInputs,
      fundBalances: fundBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      contributionCycleDays: user.contributionCycleDays,
    });

    const timeline = projectTimeline({
      obligations: obligationInputs,
      fundBalances: fundBalanceInputs,
      currentFundBalance: user.currentFundBalance,
      contributionPerCycle: engineResult.totalContributionPerCycle,
      contributionCycleDays: user.contributionCycleDays,
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
