import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type { IntervalUnit } from "@/app/generated/prisma/client";

interface CreateIncomeSourceBody {
  name: string;
  expectedAmount: number;
  intervalUnit?: IntervalUnit | null;
  intervalCount?: number;
  minimumExpected?: number | null;
  nextExpectedDate?: string | null;
}

const VALID_INTERVAL_UNITS: IntervalUnit[] = [
  "day",
  "week",
  "twice_monthly",
  "month",
  "quarter",
  "year",
];

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const incomeSources = await prisma.incomeSource.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(incomeSources);
  } catch (error) {
    logError("failed to list income sources", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

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

    if (body.intervalUnit !== undefined && body.intervalUnit !== null) {
      if (!VALID_INTERVAL_UNITS.includes(body.intervalUnit)) {
        return NextResponse.json(
          { error: "intervalUnit must be one of: day, week, twice_monthly, month, quarter, year" },
          { status: 400 }
        );
      }
    }

    if (body.intervalCount !== undefined) {
      if (typeof body.intervalCount !== "number" || !Number.isInteger(body.intervalCount) || body.intervalCount <= 0) {
        return NextResponse.json(
          { error: "intervalCount must be a positive integer" },
          { status: 400 }
        );
      }
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
        intervalUnit: body.intervalUnit ?? null,
        intervalCount: body.intervalCount ?? 1,
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
