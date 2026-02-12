import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type { IncomeFrequency } from "@/app/generated/prisma/client";

interface AcceptBody {
  action: "accept" | "dismiss";
  name?: string;
  amount?: number;
  frequency?: IncomeFrequency;
  frequencyDays?: number | null;
  isIrregular?: boolean;
  minimumExpected?: number | null;
  nextExpectedDate?: string | null;
  nextDueDate?: string | null;
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
    const body = (await request.json()) as Partial<AcceptBody>;

    if (!body.action || !["accept", "dismiss"].includes(body.action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'dismiss'" },
        { status: 400 }
      );
    }

    const suggestion = await prisma.suggestion.findUnique({
      where: { id },
    });

    if (!suggestion || suggestion.userId !== user.id) {
      return NextResponse.json(
        { error: "suggestion not found" },
        { status: 404 }
      );
    }

    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { error: "suggestion is not pending" },
        { status: 400 }
      );
    }

    if (body.action === "dismiss") {
      const updated = await prisma.suggestion.update({
        where: { id },
        data: { status: "dismissed" },
      });
      return NextResponse.json(updated);
    }

    // Accept: create the corresponding IncomeSource or Obligation
    const name = body.name ?? suggestion.vendorPattern;
    const amount = body.amount ?? suggestion.detectedAmount;
    const frequency = body.frequency ?? suggestion.detectedFrequency;
    const now = new Date();

    if (suggestion.type === "income") {
      const result = await prisma.$transaction(async (tx) => {
        const incomeSource = await tx.incomeSource.create({
          data: {
            userId: user.id,
            name,
            expectedAmount: amount,
            frequency,
            frequencyDays: body.frequencyDays ?? null,
            isIrregular: body.isIrregular ?? false,
            minimumExpected: body.minimumExpected ?? suggestion.detectedAmountMin ?? null,
            nextExpectedDate: body.nextExpectedDate ? new Date(body.nextExpectedDate) : null,
          },
        });

        const updated = await tx.suggestion.update({
          where: { id },
          data: {
            status: "accepted",
            linkedIncomeSourceId: incomeSource.id,
          },
        });

        return { suggestion: updated, incomeSource };
      });

      return NextResponse.json(result);
    }

    // expense type — create an Obligation
    const result = await prisma.$transaction(async (tx) => {
      const obligation = await tx.obligation.create({
        data: {
          userId: user.id,
          name,
          type: "recurring",
          amount,
          frequency,
          frequencyDays: body.frequencyDays ?? null,
          startDate: now,
          nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : now,
        },
      });

      const updated = await tx.suggestion.update({
        where: { id },
        data: {
          status: "accepted",
          linkedObligationId: obligation.id,
        },
      });

      return { suggestion: updated, obligation };
    });

    return NextResponse.json(result);
  } catch (error) {
    logError("failed to update suggestion", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
