import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import type { EscalationChangeType } from "@/app/generated/prisma/client";

interface CreateEscalationBody {
  obligationId: string;
  changeType: EscalationChangeType;
  value: number;
  effectiveDate: string;
  intervalMonths?: number | null;
}

const VALID_CHANGE_TYPES: EscalationChangeType[] = [
  "absolute",
  "percentage",
  "fixed_increase",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<CreateEscalationBody>;

    // Validate obligationId
    if (
      !body.obligationId ||
      typeof body.obligationId !== "string"
    ) {
      return NextResponse.json(
        { error: "obligationId is required" },
        { status: 400 }
      );
    }

    // Validate changeType
    if (
      !body.changeType ||
      !VALID_CHANGE_TYPES.includes(body.changeType as EscalationChangeType)
    ) {
      return NextResponse.json(
        {
          error:
            "changeType must be one of: absolute, percentage, fixed_increase",
        },
        { status: 400 }
      );
    }

    // Validate value
    if (
      body.value === undefined ||
      body.value === null ||
      typeof body.value !== "number"
    ) {
      return NextResponse.json(
        { error: "value must be a number" },
        { status: 400 }
      );
    }

    // Validate effectiveDate
    if (!body.effectiveDate) {
      return NextResponse.json(
        { error: "effectiveDate is required" },
        { status: 400 }
      );
    }
    const effectiveDate = new Date(body.effectiveDate);
    if (isNaN(effectiveDate.getTime())) {
      return NextResponse.json(
        { error: "effectiveDate must be a valid date" },
        { status: 400 }
      );
    }

    // Validate intervalMonths
    const intervalMonths = body.intervalMonths ?? null;
    if (intervalMonths !== null) {
      if (
        typeof intervalMonths !== "number" ||
        !Number.isInteger(intervalMonths) ||
        intervalMonths <= 0
      ) {
        return NextResponse.json(
          { error: "intervalMonths must be a positive integer" },
          { status: 400 }
        );
      }
    }

    // Absolute changeType is only valid for one-off (intervalMonths must be null)
    if (body.changeType === "absolute" && intervalMonths !== null) {
      return NextResponse.json(
        {
          error:
            "absolute changeType is only valid for one-off rules (intervalMonths must be null)",
        },
        { status: 400 }
      );
    }

    // Verify obligation exists and belongs to user
    const obligation = await prisma.obligation.findUnique({
      where: { id: body.obligationId },
    });

    if (!obligation || !obligation.isActive) {
      return NextResponse.json(
        { error: "obligation not found" },
        { status: 404 }
      );
    }

    if (obligation.userId !== user.id) {
      return NextResponse.json(
        { error: "obligation not found" },
        { status: 404 }
      );
    }

    // Reject escalation for one-off obligations
    if (obligation.type === "one_off") {
      return NextResponse.json(
        { error: "escalation is not supported for one-off obligations" },
        { status: 400 }
      );
    }

    // Check for >50% increase warning
    let warning: string | undefined;
    if (body.changeType === "percentage" && body.value > 50) {
      warning = "This will increase the amount by more than 50%";
    } else if (
      body.changeType === "fixed_increase" &&
      obligation.amount > 0 &&
      body.value > obligation.amount * 0.5
    ) {
      warning = "This will increase the amount by more than 50%";
    }

    // Determine if one-off with past date should auto-apply
    const isPastDate = effectiveDate <= new Date();
    const isOneOff = intervalMonths === null;
    const shouldAutoApply = isOneOff && isPastDate && !obligation.isPaused;

    const escalation = await prisma.$transaction(async (tx) => {
      // If recurring, replace existing recurring rule for this obligation
      if (intervalMonths !== null) {
        await tx.escalation.deleteMany({
          where: {
            obligationId: body.obligationId!,
            intervalMonths: { not: null },
          },
        });
      }

      const created = await tx.escalation.create({
        data: {
          obligationId: body.obligationId!,
          changeType: body.changeType!,
          value: body.value!,
          effectiveDate,
          intervalMonths,
          isApplied: shouldAutoApply,
          appliedAt: shouldAutoApply ? new Date() : null,
        },
      });

      // Auto-apply past one-off rules
      if (shouldAutoApply) {
        let newAmount: number;
        if (body.changeType === "absolute") {
          newAmount = body.value!;
        } else if (body.changeType === "percentage") {
          newAmount = obligation.amount * (1 + body.value! / 100);
        } else {
          // fixed_increase
          newAmount = obligation.amount + body.value!;
        }

        await tx.obligation.update({
          where: { id: body.obligationId! },
          data: { amount: newAmount },
        });
      }

      return created;
    });

    const response: Record<string, unknown> = { ...escalation };
    if (warning) {
      response.warning = warning;
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logError("failed to create escalation", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const obligationId = searchParams.get("obligationId");

    if (!obligationId) {
      return NextResponse.json(
        { error: "obligationId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify obligation belongs to user
    const obligation = await prisma.obligation.findUnique({
      where: { id: obligationId },
    });

    if (!obligation || obligation.userId !== user.id) {
      return NextResponse.json(
        { error: "obligation not found" },
        { status: 404 }
      );
    }

    const escalations = await prisma.escalation.findMany({
      where: { obligationId },
      orderBy: { effectiveDate: "asc" },
    });

    return NextResponse.json(escalations);
  } catch (error) {
    logError("failed to fetch escalations", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
