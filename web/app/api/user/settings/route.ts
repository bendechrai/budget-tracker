import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { resolveCycleConfig } from "@/lib/engine/calculate";

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
