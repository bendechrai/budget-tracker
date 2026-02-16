import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

interface FundGroupBalanceBody {
  balance: number;
  note?: string | null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const body = (await request.json()) as Partial<FundGroupBalanceBody>;

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

    const fundGroup = await prisma.fundGroup.findUnique({
      where: { id },
    });

    if (!fundGroup || fundGroup.userId !== user.id) {
      return NextResponse.json(
        { error: "fund group not found" },
        { status: 404 }
      );
    }

    const adjustmentAmount = body.balance - fundGroup.currentBalance;

    const updatedFundGroup = await prisma.$transaction(async (tx) => {
      await tx.contributionRecord.create({
        data: {
          fundGroupId: id,
          amount: adjustmentAmount,
          date: new Date(),
          type: "manual_adjustment",
          note: body.note ?? null,
        },
      });

      return tx.fundGroup.update({
        where: { id },
        data: { currentBalance: body.balance! },
      });
    });

    return NextResponse.json(updatedFundGroup, { status: 200 });
  } catch (error) {
    logError("failed to adjust fund group balance", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
