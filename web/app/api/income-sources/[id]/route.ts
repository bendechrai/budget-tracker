import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type { IncomeFrequency } from "@/app/generated/prisma/client";

interface UpdateIncomeSourceBody {
  name?: string;
  expectedAmount?: number;
  frequency?: IncomeFrequency;
  frequencyDays?: number | null;
  isIrregular?: boolean;
  minimumExpected?: number | null;
  nextExpectedDate?: string | null;
  isPaused?: boolean;
}

const VALID_FREQUENCIES: IncomeFrequency[] = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annual",
  "custom",
  "irregular",
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

    const existing = await prisma.incomeSource.findUnique({
      where: { id },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const body = (await request.json()) as Partial<UpdateIncomeSourceBody>;

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        );
      }
    }

    if (body.expectedAmount !== undefined) {
      if (
        body.expectedAmount === null ||
        typeof body.expectedAmount !== "number" ||
        body.expectedAmount < 0
      ) {
        return NextResponse.json(
          { error: "expectedAmount must be a non-negative number" },
          { status: 400 }
        );
      }
    }

    const effectiveFrequency = body.frequency ?? existing.frequency;

    if (body.frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(body.frequency)) {
        return NextResponse.json(
          {
            error:
              "frequency must be one of: weekly, fortnightly, monthly, quarterly, annual, custom, irregular",
          },
          { status: 400 }
        );
      }
    }

    if (effectiveFrequency === "custom") {
      const effectiveFrequencyDays =
        body.frequencyDays !== undefined
          ? body.frequencyDays
          : existing.frequencyDays;
      if (
        !effectiveFrequencyDays ||
        typeof effectiveFrequencyDays !== "number" ||
        !Number.isInteger(effectiveFrequencyDays) ||
        effectiveFrequencyDays <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "frequencyDays must be a positive integer when frequency is custom",
          },
          { status: 400 }
        );
      }
    }

    if (body.isIrregular !== undefined && typeof body.isIrregular !== "boolean") {
      return NextResponse.json(
        { error: "isIrregular must be a boolean" },
        { status: 400 }
      );
    }

    if (body.isPaused !== undefined && typeof body.isPaused !== "boolean") {
      return NextResponse.json(
        { error: "isPaused must be a boolean" },
        { status: 400 }
      );
    }

    if (body.minimumExpected !== undefined && body.minimumExpected !== null) {
      if (typeof body.minimumExpected !== "number" || body.minimumExpected < 0) {
        return NextResponse.json(
          { error: "minimumExpected must be a non-negative number" },
          { status: 400 }
        );
      }
    }

    let nextExpectedDate: Date | null | undefined = undefined;
    if (body.nextExpectedDate !== undefined) {
      if (body.nextExpectedDate === null) {
        nextExpectedDate = null;
      } else {
        nextExpectedDate = new Date(body.nextExpectedDate);
        if (isNaN(nextExpectedDate.getTime())) {
          return NextResponse.json(
            { error: "nextExpectedDate must be a valid date" },
            { status: 400 }
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }
    if (body.expectedAmount !== undefined) {
      updateData.expectedAmount = body.expectedAmount;
    }
    if (body.frequency !== undefined) {
      updateData.frequency = body.frequency;
    }
    if (body.frequencyDays !== undefined) {
      updateData.frequencyDays =
        effectiveFrequency === "custom" ? body.frequencyDays : null;
    } else if (body.frequency !== undefined && body.frequency !== "custom") {
      updateData.frequencyDays = null;
    }
    if (body.isIrregular !== undefined) {
      updateData.isIrregular = body.isIrregular;
    }
    if (body.isPaused !== undefined) {
      updateData.isPaused = body.isPaused;
    }
    if (body.minimumExpected !== undefined) {
      updateData.minimumExpected = body.minimumExpected;
    }
    if (nextExpectedDate !== undefined) {
      updateData.nextExpectedDate = nextExpectedDate;
    }

    const updated = await prisma.incomeSource.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    logError("failed to update income source", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
