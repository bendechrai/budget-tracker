import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type { IntervalUnit } from "@/app/generated/prisma/client";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.obligation.findUnique({
      where: { id },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await prisma.obligation.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("failed to delete obligation", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

interface UpdateObligationBody {
  name?: string;
  amount?: number;
  intervalUnit?: IntervalUnit | null;
  intervalCount?: number;
  nextDueDate?: string;
  endDate?: string | null;
  isPaused?: boolean;
  isArchived?: boolean;
  fundGroupId?: string | null;
}

const VALID_INTERVAL_UNITS: IntervalUnit[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

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

    const existing = await prisma.obligation.findUnique({
      where: { id },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const body = (await request.json()) as Partial<UpdateObligationBody>;

    // Validate name
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        );
      }
    }

    // Validate amount
    if (body.amount !== undefined) {
      if (
        body.amount === null ||
        typeof body.amount !== "number" ||
        body.amount < 0
      ) {
        return NextResponse.json(
          { error: "amount must be a non-negative number" },
          { status: 400 }
        );
      }
    }

    // Validate intervalUnit
    if (body.intervalUnit !== undefined) {
      if (
        body.intervalUnit !== null &&
        !VALID_INTERVAL_UNITS.includes(body.intervalUnit)
      ) {
        return NextResponse.json(
          {
            error:
              "intervalUnit must be one of: day, week, month, quarter, year",
          },
          { status: 400 }
        );
      }
    }

    // Validate intervalCount
    if (body.intervalCount !== undefined) {
      if (
        typeof body.intervalCount !== "number" ||
        !Number.isInteger(body.intervalCount) ||
        body.intervalCount <= 0
      ) {
        return NextResponse.json(
          {
            error: "intervalCount must be a positive integer",
          },
          { status: 400 }
        );
      }
    }

    // Validate nextDueDate
    let nextDueDate: Date | undefined;
    if (body.nextDueDate !== undefined) {
      nextDueDate = new Date(body.nextDueDate);
      if (isNaN(nextDueDate.getTime())) {
        return NextResponse.json(
          { error: "nextDueDate must be a valid date" },
          { status: 400 }
        );
      }
    }

    // Validate endDate
    let endDate: Date | null | undefined;
    if (body.endDate !== undefined) {
      if (body.endDate === null) {
        endDate = null;
      } else {
        endDate = new Date(body.endDate);
        if (isNaN(endDate.getTime())) {
          return NextResponse.json(
            { error: "endDate must be a valid date" },
            { status: 400 }
          );
        }
      }
    }

    // Validate isPaused
    if (body.isPaused !== undefined && typeof body.isPaused !== "boolean") {
      return NextResponse.json(
        { error: "isPaused must be a boolean" },
        { status: 400 }
      );
    }

    // Validate isArchived
    if (body.isArchived !== undefined && typeof body.isArchived !== "boolean") {
      return NextResponse.json(
        { error: "isArchived must be a boolean" },
        { status: 400 }
      );
    }

    // Validate fundGroupId
    if (body.fundGroupId !== undefined && body.fundGroupId !== null) {
      const fundGroup = await prisma.fundGroup.findUnique({
        where: { id: body.fundGroupId },
      });
      if (!fundGroup || fundGroup.userId !== user.id) {
        return NextResponse.json(
          { error: "fund group not found" },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }
    if (body.amount !== undefined) {
      updateData.amount = body.amount;
    }
    if (body.intervalUnit !== undefined) {
      updateData.intervalUnit = body.intervalUnit;
    }
    if (body.intervalCount !== undefined) {
      updateData.intervalCount = body.intervalCount;
    }
    if (nextDueDate !== undefined) {
      updateData.nextDueDate = nextDueDate;
    }
    if (endDate !== undefined) {
      updateData.endDate = endDate;
    }
    if (body.isPaused !== undefined) {
      updateData.isPaused = body.isPaused;
    }
    if (body.isArchived !== undefined) {
      updateData.isArchived = body.isArchived;
    }
    if (body.fundGroupId !== undefined) {
      updateData.fundGroupId = body.fundGroupId;
    }

    const updated = await prisma.obligation.update({
      where: { id },
      data: updateData,
      include: {
        customEntries: true,
        fundGroup: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logError("failed to update obligation", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
