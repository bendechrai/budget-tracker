import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import type { ObligationInput, FundBalanceInput } from "@/lib/engine/calculate";

interface FundBalanceBody {
  balance: number;
  note?: string | null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ obligationId: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { obligationId } = await params;

    if (!obligationId || typeof obligationId !== "string" || obligationId.trim() === "") {
      return NextResponse.json(
        { error: "obligationId is required" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as Partial<FundBalanceBody>;

    if (
      body.balance === undefined ||
      body.balance === null ||
      typeof body.balance !== "number"
    ) {
      return NextResponse.json(
        { error: "balance is required and must be a number" },
        { status: 400 }
      );
    }

    if (body.balance < 0) {
      return NextResponse.json(
        { error: "balance must not be negative" },
        { status: 400 }
      );
    }

    // Verify the obligation exists and belongs to the user
    const obligation = await prisma.obligation.findUnique({
      where: { id: obligationId },
    });

    if (!obligation || obligation.userId !== user.id) {
      return NextResponse.json(
        { error: "obligation not found" },
        { status: 404 }
      );
    }

    // Get the current fund balance to calculate the adjustment amount
    const existingFundBalance = await prisma.fundBalance.findUnique({
      where: { obligationId },
    });

    const previousBalance = existingFundBalance?.currentBalance ?? 0;
    const adjustmentAmount = body.balance - previousBalance;

    // Record the manual adjustment and set the fund balance in a transaction
    const { fundBalance } = await prisma.$transaction(async (tx) => {
      // Create the contribution record for the adjustment
      await tx.contributionRecord.create({
        data: {
          obligationId,
          amount: adjustmentAmount,
          date: new Date(),
          type: "manual_adjustment",
          note: body.note ?? null,
        },
      });

      // Upsert the fund balance to the exact value
      const updatedFundBalance = await tx.fundBalance.upsert({
        where: { obligationId },
        create: {
          obligationId,
          currentBalance: body.balance!,
        },
        update: {
          currentBalance: body.balance!,
        },
      });

      return { fundBalance: updatedFundBalance };
    });

    // Trigger engine recalculation
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

    const { snapshot } = calculateAndSnapshot({
      obligations: obligationInputs,
      fundBalances: fundBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      contributionCycleDays: user.contributionCycleDays,
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

    return NextResponse.json(fundBalance, { status: 200 });
  } catch (error) {
    logError("failed to adjust fund balance", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
