import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import { resolveCycleConfig } from "@/lib/engine/calculate";
import type { ObligationInput, FundGroupBalanceInput } from "@/lib/engine/calculate";

interface BulkContributionItem {
  fundGroupId: string;
  amount: number;
}

interface BulkContributionBody {
  contributions: BulkContributionItem[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<BulkContributionBody>;

    // Validate contributions array
    if (!body.contributions || !Array.isArray(body.contributions) || body.contributions.length === 0) {
      return NextResponse.json(
        { error: "contributions array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate each item
    for (const item of body.contributions) {
      if (!item.fundGroupId || typeof item.fundGroupId !== "string" || item.fundGroupId.trim() === "") {
        return NextResponse.json(
          { error: "each contribution must have a valid fundGroupId" },
          { status: 400 }
        );
      }
      if (item.amount === undefined || item.amount === null || typeof item.amount !== "number") {
        return NextResponse.json(
          { error: "each contribution must have a numeric amount" },
          { status: 400 }
        );
      }
      if (item.amount === 0) {
        return NextResponse.json(
          { error: "contribution amounts must not be zero" },
          { status: 400 }
        );
      }
    }

    // Verify all fund groups exist and belong to the user
    const fundGroupIds = body.contributions.map((c) => c.fundGroupId);
    const fundGroups = await prisma.fundGroup.findMany({
      where: { id: { in: fundGroupIds } },
    });

    const userFundGroupIds = new Set(
      fundGroups.filter((fg) => fg.userId === user.id).map((fg) => fg.id)
    );

    for (const id of fundGroupIds) {
      if (!userFundGroupIds.has(id)) {
        return NextResponse.json(
          { error: "fund group not found" },
          { status: 404 }
        );
      }
    }

    // Record all contributions and update balances in a single transaction
    await prisma.$transaction(async (tx) => {
      for (const item of body.contributions!) {
        await tx.contributionRecord.create({
          data: {
            fundGroupId: item.fundGroupId,
            amount: item.amount,
            date: new Date(),
            type: "contribution",
            note: "Lump sum catch-up",
          },
        });

        await tx.fundGroup.update({
          where: { id: item.fundGroupId },
          data: {
            currentBalance: {
              increment: item.amount,
            },
          },
        });
      }
    });

    // Trigger one engine recalculation
    const incomeSources = await prisma.incomeSource.findMany({
      where: { userId: user.id, isActive: true },
      select: { frequency: true, isIrregular: true, isActive: true, isPaused: true },
    });

    const cycleConfig = resolveCycleConfig(
      {
        contributionCycleType: user.contributionCycleType ?? null,
        contributionPayDays: user.contributionPayDays ?? [],
      },
      incomeSources,
    );

    const allObligations = await prisma.obligation.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
      include: {
        customEntries: true,
      },
    });

    const allFundGroups = await prisma.fundGroup.findMany({
      where: { userId: user.id },
    });

    const obligationInputs: ObligationInput[] = allObligations.map((o) => ({
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

    const fundGroupBalanceInputs: FundGroupBalanceInput[] = allFundGroups.map((fg) => ({
      fundGroupId: fg.id,
      name: fg.name,
      currentBalance: fg.currentBalance,
    }));

    const { snapshot } = calculateAndSnapshot({
      obligations: obligationInputs,
      fundGroupBalances: fundGroupBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      cycleConfig,
    });

    await prisma.engineSnapshot.create({
      data: {
        userId: user.id,
        totalRequired: snapshot.totalRequired,
        totalFunded: snapshot.totalFunded,
        nextActionAmount: snapshot.nextActionAmount,
        nextActionDate: snapshot.nextActionDate,
        nextActionDescription: snapshot.nextActionDescription,
        nextActionFundGroupId: snapshot.nextActionFundGroupId,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logError("failed to record bulk contributions", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
