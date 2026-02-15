import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import { cycleDaysToConfig } from "@/lib/engine/calculate";
import type { ObligationInput, FundBalanceInput } from "@/lib/engine/calculate";

interface BulkContributionItem {
  obligationId: string;
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
      if (!item.obligationId || typeof item.obligationId !== "string" || item.obligationId.trim() === "") {
        return NextResponse.json(
          { error: "each contribution must have a valid obligationId" },
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

    // Verify all obligations exist and belong to the user
    const obligationIds = body.contributions.map((c) => c.obligationId);
    const obligations = await prisma.obligation.findMany({
      where: { id: { in: obligationIds } },
    });

    const userObligationIds = new Set(
      obligations.filter((o) => o.userId === user.id).map((o) => o.id)
    );

    for (const id of obligationIds) {
      if (!userObligationIds.has(id)) {
        return NextResponse.json(
          { error: "obligation not found" },
          { status: 404 }
        );
      }
    }

    // Record all contributions and update fund balances in a single transaction
    const updatedBalances = await prisma.$transaction(async (tx) => {
      const balances = [];

      for (const item of body.contributions!) {
        await tx.contributionRecord.create({
          data: {
            obligationId: item.obligationId,
            amount: item.amount,
            date: new Date(),
            type: "contribution",
            note: "Lump sum catch-up",
          },
        });

        const updatedFundBalance = await tx.fundBalance.upsert({
          where: { obligationId: item.obligationId },
          create: {
            obligationId: item.obligationId,
            currentBalance: item.amount,
          },
          update: {
            currentBalance: {
              increment: item.amount,
            },
          },
        });

        balances.push(updatedFundBalance);
      }

      return balances;
    });

    // Trigger one engine recalculation
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

    const fundBalances = await prisma.fundBalance.findMany({
      where: {
        obligation: {
          userId: user.id,
        },
      },
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

    const fundBalanceInputs: FundBalanceInput[] = fundBalances.map((fb) => ({
      obligationId: fb.obligationId,
      currentBalance: fb.currentBalance,
    }));

    const { snapshot } = calculateAndSnapshot({
      obligations: obligationInputs,
      fundBalances: fundBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      cycleConfig: cycleDaysToConfig(user.contributionCycleDays),
    });

    await prisma.engineSnapshot.create({
      data: {
        userId: user.id,
        totalRequired: snapshot.totalRequired,
        totalFunded: snapshot.totalFunded,
        nextActionAmount: snapshot.nextActionAmount,
        nextActionDate: snapshot.nextActionDate,
        nextActionDescription: snapshot.nextActionDescription,
      },
    });

    return NextResponse.json({ balances: updatedBalances }, { status: 201 });
  } catch (error) {
    logError("failed to record bulk contributions", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
