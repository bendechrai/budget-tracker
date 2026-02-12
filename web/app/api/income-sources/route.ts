import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type { IncomeFrequency } from "@/app/generated/prisma/client";

interface CreateIncomeSourceBody {
  name: string;
  expectedAmount: number;
  frequency: IncomeFrequency;
  frequencyDays?: number | null;
  isIrregular: boolean;
  minimumExpected?: number | null;
  nextExpectedDate?: string | null;
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<CreateIncomeSourceBody>;

    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (body.expectedAmount === undefined || body.expectedAmount === null || typeof body.expectedAmount !== "number" || body.expectedAmount < 0) {
      return NextResponse.json(
        { error: "expectedAmount must be a non-negative number" },
        { status: 400 }
      );
    }

    if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json(
        { error: "frequency must be one of: weekly, fortnightly, monthly, quarterly, annual, custom, irregular" },
        { status: 400 }
      );
    }

    if (body.frequency === "custom") {
      if (!body.frequencyDays || typeof body.frequencyDays !== "number" || !Number.isInteger(body.frequencyDays) || body.frequencyDays <= 0) {
        return NextResponse.json(
          { error: "frequencyDays must be a positive integer when frequency is custom" },
          { status: 400 }
        );
      }
    }

    if (typeof body.isIrregular !== "boolean") {
      return NextResponse.json(
        { error: "isIrregular is required and must be a boolean" },
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

    let nextExpectedDate: Date | null = null;
    if (body.nextExpectedDate !== undefined && body.nextExpectedDate !== null) {
      nextExpectedDate = new Date(body.nextExpectedDate);
      if (isNaN(nextExpectedDate.getTime())) {
        return NextResponse.json(
          { error: "nextExpectedDate must be a valid date" },
          { status: 400 }
        );
      }
    }

    const incomeSource = await prisma.incomeSource.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        expectedAmount: body.expectedAmount,
        frequency: body.frequency,
        frequencyDays: body.frequency === "custom" ? body.frequencyDays! : null,
        isIrregular: body.isIrregular,
        minimumExpected: body.minimumExpected ?? null,
        nextExpectedDate,
      },
    });

    return NextResponse.json(incomeSource, { status: 201 });
  } catch (error) {
    logError("failed to create income source", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
