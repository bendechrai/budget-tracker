import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import type { ObligationInput, FundBalanceInput } from "@/lib/engine/calculate";
import type { ContributionType } from "@/app/generated/prisma/client";

interface ContributionBody {
  obligationId: string;
  amount: number;
  type: ContributionType;
  note?: string | null;
}

const VALID_TYPES: ContributionType[] = ["contribution", "manual_adjustment"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<ContributionBody>;

    // Validate obligationId
    if (
      !body.obligationId ||
      typeof body.obligationId !== "string" ||
      body.obligationId.trim() === ""
    ) {
      return NextResponse.json(
        { error: "obligationId is required" },
        { status: 400 }
      );
    }

    // Validate amount
    if (
      body.amount === undefined ||
      body.amount === null ||
      typeof body.amount !== "number"
    ) {
      return NextResponse.json(
        { error: "amount is required and must be a number" },
        { status: 400 }
      );
    }

    // Validate type
    if (
      !body.type ||
      !VALID_TYPES.includes(body.type as ContributionType)
    ) {
      return NextResponse.json(
        { error: "type must be one of: contribution, manual_adjustment" },
        { status: 400 }
      );
    }

    // Verify the obligation exists and belongs to the user
    const obligation = await prisma.obligation.findUnique({
      where: { id: body.obligationId },
    });

    if (!obligation || obligation.userId !== user.id) {
      return NextResponse.json(
        { error: "obligation not found" },
        { status: 404 }
      );
    }

    // Record the contribution and update fund balance in a transaction
    const { fundBalance } = await prisma.$transaction(async (tx) => {
      // Create the contribution record
      await tx.contributionRecord.create({
        data: {
          obligationId: body.obligationId!,
          amount: body.amount!,
          date: new Date(),
          type: body.type!,
          note: body.note ?? null,
        },
      });

      // Upsert the fund balance
      const updatedFundBalance = await tx.fundBalance.upsert({
        where: { obligationId: body.obligationId! },
        create: {
          obligationId: body.obligationId!,
          currentBalance: body.amount!,
        },
        update: {
          currentBalance: {
            increment: body.amount!,
          },
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

    return NextResponse.json(fundBalance, { status: 201 });
  } catch (error) {
    logError("failed to record contribution", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
