import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type {
  ObligationType,
  IncomeFrequency,
} from "@/app/generated/prisma/client";

interface CustomScheduleEntryInput {
  dueDate: string;
  amount: number;
}

interface CreateObligationBody {
  name: string;
  type: ObligationType;
  amount: number;
  frequency?: IncomeFrequency | null;
  frequencyDays?: number | null;
  startDate: string;
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

const VALID_FREQUENCIES: IncomeFrequency[] = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annual",
  "custom",
  "irregular",
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
        fundBalance: true,
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

    // Validate frequency for recurring types
    if (
      body.type === "recurring" ||
      body.type === "recurring_with_end"
    ) {
      if (
        !body.frequency ||
        !VALID_FREQUENCIES.includes(body.frequency as IncomeFrequency)
      ) {
        return NextResponse.json(
          {
            error:
              "frequency is required for recurring obligations and must be one of: weekly, fortnightly, monthly, quarterly, annual, custom, irregular",
          },
          { status: 400 }
        );
      }

      if (body.frequency === "custom") {
        if (
          !body.frequencyDays ||
          typeof body.frequencyDays !== "number" ||
          !Number.isInteger(body.frequencyDays) ||
          body.frequencyDays <= 0
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
    }

    // Validate startDate
    if (!body.startDate) {
      return NextResponse.json(
        { error: "startDate is required" },
        { status: 400 }
      );
    }
    const startDate = new Date(body.startDate);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: "startDate must be a valid date" },
        { status: 400 }
      );
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

    // Validate fundGroupId if provided
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

    // Create obligation with custom entries in a transaction
    const obligation = await prisma.$transaction(async (tx) => {
      const created = await tx.obligation.create({
        data: {
          userId: user.id,
          name: body.name!.trim(),
          type: body.type!,
          amount: body.amount!,
          frequency:
            body.type === "recurring" || body.type === "recurring_with_end"
              ? body.frequency!
              : null,
          frequencyDays:
            (body.type === "recurring" || body.type === "recurring_with_end") &&
            body.frequency === "custom"
              ? body.frequencyDays!
              : null,
          startDate,
          endDate,
          nextDueDate,
          fundGroupId: body.fundGroupId ?? null,
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
