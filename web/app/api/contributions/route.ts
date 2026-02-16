import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateAndSnapshot } from "@/lib/engine/snapshot";
import { resolveCycleConfig } from "@/lib/engine/calculate";
import type { ObligationInput, FundGroupBalanceInput } from "@/lib/engine/calculate";
import type { ContributionType } from "@/app/generated/prisma/client";

interface ContributionBody {
  fundGroupId: string;
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

    // Validate fundGroupId
    if (
      !body.fundGroupId ||
      typeof body.fundGroupId !== "string" ||
      body.fundGroupId.trim() === ""
    ) {
      return NextResponse.json(
        { error: "fundGroupId is required" },
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

    // Verify the fund group exists and belongs to the user
    const fundGroup = await prisma.fundGroup.findUnique({
      where: { id: body.fundGroupId },
    });

    if (!fundGroup || fundGroup.userId !== user.id) {
      return NextResponse.json(
        { error: "fund group not found" },
        { status: 404 }
      );
    }

    // Record the contribution and update fund group balance in a transaction
    const updatedFundGroup = await prisma.$transaction(async (tx) => {
      await tx.contributionRecord.create({
        data: {
          fundGroupId: body.fundGroupId!,
          amount: body.amount!,
          date: new Date(),
          type: body.type!,
          note: body.note ?? null,
        },
      });

      return tx.fundGroup.update({
        where: { id: body.fundGroupId! },
        data: {
          currentBalance: {
            increment: body.amount!,
          },
        },
      });
    });

    // Trigger engine recalculation
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

    const fundGroupBalanceInputs: FundGroupBalanceInput[] = fundGroups.map((fg) => ({
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

    return NextResponse.json(updatedFundGroup, { status: 201 });
  } catch (error) {
    logError("failed to record contribution", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
