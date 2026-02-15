import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { resolveCycleConfig } from "@/lib/engine/calculate";

const VALID_CYCLE_TYPES = ["weekly", "fortnightly", "twice_monthly", "monthly"] as const;
type ValidCycleType = (typeof VALID_CYCLE_TYPES)[number];

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Fetch active income sources for auto-detection recommendation
    const incomeSources = await prisma.incomeSource.findMany({
      where: { userId: user.id, isActive: true },
      select: { frequency: true, isIrregular: true, isActive: true, isPaused: true },
    });

    // Resolve auto-detected cycle (ignoring explicit user setting)
    const autoDetected = resolveCycleConfig(
      { contributionCycleType: null, contributionPayDays: [] },
      incomeSources,
    );

    return NextResponse.json({
      email: user.email,
      contributionCycleType: user.contributionCycleType,
      contributionPayDays: user.contributionPayDays,
      currencySymbol: user.currencySymbol,
      maxContributionPerCycle: user.maxContributionPerCycle,
      autoDetectedCycle: autoDetected,
    });
  } catch (error) {
    logError("failed to get user settings", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    let cycleOrMaxChanged = false;

    // Handle contributionCycleType
    if ("contributionCycleType" in body) {
      if (body.contributionCycleType !== null) {
        if (!VALID_CYCLE_TYPES.includes(body.contributionCycleType as ValidCycleType)) {
          return NextResponse.json(
            { error: "invalid contribution cycle type" },
            { status: 400 },
          );
        }
        updateData.contributionCycleType = body.contributionCycleType;
      } else {
        updateData.contributionCycleType = null;
      }
      cycleOrMaxChanged = true;
    }

    // Handle contributionPayDays
    if ("contributionPayDays" in body) {
      if (!Array.isArray(body.contributionPayDays) || !body.contributionPayDays.every((d: unknown) => typeof d === "number" && d >= 1 && d <= 31)) {
        return NextResponse.json(
          { error: "contributionPayDays must be an array of numbers between 1 and 31" },
          { status: 400 },
        );
      }
      updateData.contributionPayDays = body.contributionPayDays;
      cycleOrMaxChanged = true;
    }

    // Handle currencySymbol
    if ("currencySymbol" in body) {
      if (typeof body.currencySymbol !== "string" || body.currencySymbol.length === 0 || body.currencySymbol.length > 5) {
        return NextResponse.json(
          { error: "currencySymbol must be a non-empty string up to 5 characters" },
          { status: 400 },
        );
      }
      updateData.currencySymbol = body.currencySymbol;
    }

    // Handle maxContributionPerCycle
    if ("maxContributionPerCycle" in body) {
      if (body.maxContributionPerCycle !== null) {
        if (typeof body.maxContributionPerCycle !== "number" || body.maxContributionPerCycle <= 0) {
          return NextResponse.json(
            { error: "maxContributionPerCycle must be a positive number or null" },
            { status: 400 },
          );
        }
        updateData.maxContributionPerCycle = body.maxContributionPerCycle;
      } else {
        updateData.maxContributionPerCycle = null;
      }
      cycleOrMaxChanged = true;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "no valid fields to update" },
        { status: 400 },
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Trigger engine recalculation if cycle or max contribution changed
    if (cycleOrMaxChanged) {
      try {
        const baseUrl = request.nextUrl.origin;
        await fetch(`${baseUrl}/api/engine/recalculate`, {
          method: "POST",
          headers: {
            cookie: request.headers.get("cookie") ?? "",
          },
        });
      } catch (recalcError) {
        logError("failed to trigger engine recalculation after settings update", recalcError);
      }
    }

    return NextResponse.json({
      contributionCycleType: updated.contributionCycleType,
      contributionPayDays: updated.contributionPayDays,
      currencySymbol: updated.currencySymbol,
      maxContributionPerCycle: updated.maxContributionPerCycle,
    });
  } catch (error) {
    logError("failed to update user settings", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}
