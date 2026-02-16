import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type {
  ObligationType,
  IntervalUnit,
} from "@/app/generated/prisma/client";

interface CustomScheduleEntryInput {
  dueDate: string;
  amount: number;
}

interface CreateObligationBody {
  name: string;
  type: ObligationType;
  amount: number;
  intervalUnit?: IntervalUnit | null;
  intervalCount?: number;
  endDate?: string | null;
  nextDueDate: string;
  fundGroupId?: string | null;
  customEntries?: CustomScheduleEntryInput[];
}

const VALID_TYPES: ObligationType[] = [
  "recurring",
  "recurring_with_end",
  "one_off",
  "custom",
];

const VALID_INTERVAL_UNITS: IntervalUnit[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const archived = searchParams.get("archived") === "true";

    const obligations = await prisma.obligation.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: archived,
      },
      include: {
        customEntries: true,
        fundGroup: true,
      },
      orderBy: {
        nextDueDate: "asc",
      },
    });

    return NextResponse.json(obligations);
  } catch (error) {
    logError("failed to fetch obligations", error);
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

    const body = (await request.json()) as Partial<CreateObligationBody>;

    // Validate name
    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Validate type
    if (
      !body.type ||
      !VALID_TYPES.includes(body.type as ObligationType)
    ) {
      return NextResponse.json(
        {
          error:
            "type must be one of: recurring, recurring_with_end, one_off, custom",
        },
        { status: 400 }
      );
    }

    // Validate amount
    if (
      body.amount === undefined ||
      body.amount === null ||
      typeof body.amount !== "number" ||
      body.amount < 0
    ) {
      return NextResponse.json(
        { error: "amount must be a non-negative number" },
        { status: 400 }
      );
    }

    // Validate intervalUnit for recurring types
    if (
      body.type === "recurring" ||
      body.type === "recurring_with_end"
    ) {
      if (
        !body.intervalUnit ||
        !VALID_INTERVAL_UNITS.includes(body.intervalUnit as IntervalUnit)
      ) {
        return NextResponse.json(
          {
            error:
              "intervalUnit is required for recurring obligations and must be one of: day, week, month, quarter, year",
          },
          { status: 400 }
        );
      }

      if (
        body.intervalCount !== undefined &&
        (typeof body.intervalCount !== "number" ||
          !Number.isInteger(body.intervalCount) ||
          body.intervalCount <= 0)
      ) {
        return NextResponse.json(
          {
            error: "intervalCount must be a positive integer",
          },
          { status: 400 }
        );
      }
    }

    // Validate endDate for recurring_with_end
    let endDate: Date | null = null;
    if (body.type === "recurring_with_end") {
      if (!body.endDate) {
        return NextResponse.json(
          { error: "endDate is required for recurring_with_end obligations" },
          { status: 400 }
        );
      }
      endDate = new Date(body.endDate);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: "endDate must be a valid date" },
          { status: 400 }
        );
      }
    } else if (body.endDate !== undefined && body.endDate !== null) {
      endDate = new Date(body.endDate);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: "endDate must be a valid date" },
          { status: 400 }
        );
      }
    }

    // Validate nextDueDate
    if (!body.nextDueDate) {
      return NextResponse.json(
        { error: "nextDueDate is required" },
        { status: 400 }
      );
    }
    const nextDueDate = new Date(body.nextDueDate);
    if (isNaN(nextDueDate.getTime())) {
      return NextResponse.json(
        { error: "nextDueDate must be a valid date" },
        { status: 400 }
      );
    }

    // Validate customEntries for custom type
    if (body.type === "custom") {
      if (
        !body.customEntries ||
        !Array.isArray(body.customEntries) ||
        body.customEntries.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "customEntries is required and must be a non-empty array for custom obligations",
          },
          { status: 400 }
        );
      }

      for (let i = 0; i < body.customEntries.length; i++) {
        const entry = body.customEntries[i];
        if (!entry.dueDate) {
          return NextResponse.json(
            { error: `customEntries[${i}].dueDate is required` },
            { status: 400 }
          );
        }
        const entryDate = new Date(entry.dueDate);
        if (isNaN(entryDate.getTime())) {
          return NextResponse.json(
            { error: `customEntries[${i}].dueDate must be a valid date` },
            { status: 400 }
          );
        }
        if (
          entry.amount === undefined ||
          entry.amount === null ||
          typeof entry.amount !== "number" ||
          entry.amount < 0
        ) {
          return NextResponse.json(
            {
              error: `customEntries[${i}].amount must be a non-negative number`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Resolve fundGroupId: use provided value, or fall back to user's default
    let resolvedFundGroupId: string;
    if (body.fundGroupId) {
      const fundGroup = await prisma.fundGroup.findUnique({
        where: { id: body.fundGroupId },
      });
      if (!fundGroup || fundGroup.userId !== user.id) {
        return NextResponse.json(
          { error: "fund group not found" },
          { status: 400 }
        );
      }
      resolvedFundGroupId = fundGroup.id;
    } else {
      const defaultFundGroup = await prisma.fundGroup.findFirst({
        where: { userId: user.id, isDefault: true },
      });
      if (!defaultFundGroup) {
        return NextResponse.json(
          { error: "no default fund group found" },
          { status: 500 }
        );
      }
      resolvedFundGroupId = defaultFundGroup.id;
    }

    // Create obligation with custom entries in a transaction
    const obligation = await prisma.$transaction(async (tx) => {
      const created = await tx.obligation.create({
        data: {
          userId: user.id,
          name: body.name!.trim(),
          type: body.type!,
          amount: body.amount!,
          intervalUnit:
            body.type === "recurring" || body.type === "recurring_with_end"
              ? body.intervalUnit!
              : null,
          intervalCount:
            body.type === "recurring" || body.type === "recurring_with_end"
              ? (body.intervalCount ?? 1)
              : 1,
          endDate,
          nextDueDate,
          fundGroupId: resolvedFundGroupId,
        },
      });

      if (body.type === "custom" && body.customEntries) {
        await tx.customScheduleEntry.createMany({
          data: body.customEntries.map((entry) => ({
            obligationId: created.id,
            dueDate: new Date(entry.dueDate),
            amount: entry.amount,
          })),
        });
      }

      return tx.obligation.findUnique({
        where: { id: created.id },
        include: { customEntries: true },
      });
    });

    return NextResponse.json(obligation, { status: 201 });
  } catch (error) {
    logError("failed to create obligation", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
