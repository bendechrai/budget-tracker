import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createSession } from "@/lib/auth/session";
import { logError } from "@/lib/logging";

interface OnboardingBody {
  currentFundBalance: number;
  currencySymbol: string;
  maxContributionPerCycle?: number;
  contributionCycleDays?: number;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<OnboardingBody>;

    if (body.currentFundBalance === undefined || body.currentFundBalance === null) {
      return NextResponse.json(
        { error: "currentFundBalance is required" },
        { status: 400 }
      );
    }

    if (typeof body.currentFundBalance !== "number" || body.currentFundBalance < 0) {
      return NextResponse.json(
        { error: "currentFundBalance must be a non-negative number" },
        { status: 400 }
      );
    }

    if (!body.currencySymbol || !body.currencySymbol.trim()) {
      return NextResponse.json(
        { error: "currencySymbol is required" },
        { status: 400 }
      );
    }

    if (
      body.maxContributionPerCycle !== undefined &&
      (typeof body.maxContributionPerCycle !== "number" || body.maxContributionPerCycle <= 0)
    ) {
      return NextResponse.json(
        { error: "maxContributionPerCycle must be a positive number" },
        { status: 400 }
      );
    }

    if (
      body.contributionCycleDays !== undefined &&
      (typeof body.contributionCycleDays !== "number" || body.contributionCycleDays <= 0 || !Number.isInteger(body.contributionCycleDays))
    ) {
      return NextResponse.json(
        { error: "contributionCycleDays must be a positive integer" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        currentFundBalance: body.currentFundBalance,
        currencySymbol: body.currencySymbol.trim(),
        maxContributionPerCycle: body.maxContributionPerCycle ?? null,
        contributionCycleDays: body.contributionCycleDays ?? null,
        onboardingComplete: true,
      },
    });

    // Refresh the session with updated onboardingComplete status
    await createSession(updated.id, updated.onboardingComplete);

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      currencySymbol: updated.currencySymbol,
      currentFundBalance: updated.currentFundBalance,
      maxContributionPerCycle: updated.maxContributionPerCycle,
      contributionCycleDays: updated.contributionCycleDays,
      onboardingComplete: updated.onboardingComplete,
    });
  } catch (error) {
    logError("onboarding update failed", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
