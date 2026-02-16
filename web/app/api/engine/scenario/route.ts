import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateWithWhatIf, resolveCycleConfig } from "@/lib/engine/calculate";
import { generateSnapshot } from "@/lib/engine/snapshot";
import { projectTimeline, calculateSteadyStatePerCycle } from "@/lib/engine/timeline";
import type {
  ObligationInput,
  FundGroupBalanceInput,
  WhatIfOverrides,
} from "@/lib/engine/calculate";
import type { EscalationRule } from "@/lib/engine/escalation";

interface EscalationRuleBody {
  id: string;
  changeType: string;
  value: number;
  effectiveDate: string;
  intervalMonths: number | null;
  isApplied: boolean;
}

interface ScenarioRequestBody {
  toggledOffIds?: string[];
  amountOverrides?: Record<string, number>;
  hypotheticals?: ObligationInput[];
  escalationOverrides?: Record<string, EscalationRuleBody[]>;
  months?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ScenarioRequestBody;
    const monthsAhead = Math.max(
      1,
      Math.min(12, body.months ?? 6)
    );

    const parsedEscalationOverrides: Record<string, EscalationRule[]> = {};
    if (body.escalationOverrides) {
      for (const [oblId, rules] of Object.entries(body.escalationOverrides)) {
        parsedEscalationOverrides[oblId] = rules.map((r) => ({
          id: r.id,
          changeType: r.changeType as EscalationRule["changeType"],
          value: r.value,
          effectiveDate: new Date(r.effectiveDate),
          intervalMonths: r.intervalMonths,
          isApplied: r.isApplied,
        }));
      }
    }

    const overrides: WhatIfOverrides = {
      toggledOffIds: body.toggledOffIds ?? [],
      amountOverrides: body.amountOverrides ?? {},
      hypotheticals: (body.hypotheticals ?? []).map((h) => ({
        ...h,
        nextDueDate: new Date(h.nextDueDate),
        endDate: h.endDate ? new Date(h.endDate) : null,
      })),
      escalationOverrides: parsedEscalationOverrides,
    };

    // Fetch active income sources for cycle auto-detection
    const incomeSources = await prisma.incomeSource.findMany({
      where: { userId: user.id, isActive: true },
      select: { intervalUnit: true, intervalCount: true, isActive: true, isPaused: true },
    });

    // Resolve cycle config: explicit user setting > auto-detect from income > monthly default
    const cycleConfig = resolveCycleConfig(
      {
        contributionCycleType: user.contributionCycleType ?? null,
        contributionPayDays: user.contributionPayDays ?? [],
      },
      incomeSources,
    );

    const obligations = await prisma.obligation.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
      include: {
        customEntries: true,
      },
    });

    const fundGroups = await prisma.fundGroup.findMany({
      where: { userId: user.id },
    });

    const obligationInputs: ObligationInput[] = obligations.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      amount: o.amount,
      intervalUnit: o.intervalUnit,
      intervalCount: o.intervalCount,
      nextDueDate: o.nextDueDate,
      endDate: o.endDate,
      isPaused: o.isPaused,
      isActive: o.isActive,
      fundGroupId: o.fundGroupId,
      customEntries: o.customEntries.map((e) => ({
        dueDate: e.dueDate,
        amount: e.amount,
        isPaid: e.isPaid,
      })),
    }));

    const fundGroupBalanceInputs: FundGroupBalanceInput[] = fundGroups.map((fg) => ({
      fundGroupId: fg.id,
      name: fg.name,
      currentBalance: fg.currentBalance,
    }));

    const engineInput = {
      obligations: obligationInputs,
      fundGroupBalances: fundGroupBalanceInputs,
      cycleConfig,
    };

    const { scenario } = calculateWithWhatIf(engineInput, overrides);
    const scenarioSnapshot = generateSnapshot(scenario, engineInput.cycleConfig);

    // Build scenario obligation inputs for timeline projection
    const toggledOffSet = new Set(overrides.toggledOffIds);
    const scenarioObligations = obligationInputs
      .filter((o) => !toggledOffSet.has(o.id))
      .map((o) => {
        let result = o;
        const overriddenAmount = overrides.amountOverrides[o.id];
        if (overriddenAmount !== undefined) {
          result = { ...result, amount: overriddenAmount };
        }
        const hypotheticalEscalations = overrides.escalationOverrides?.[o.id];
        if (hypotheticalEscalations && hypotheticalEscalations.length > 0) {
          result = {
            ...result,
            escalationRules: [
              ...(result.escalationRules ?? []),
              ...hypotheticalEscalations,
            ],
          };
        }
        return result;
      });

    const allScenarioObligations = [
      ...scenarioObligations,
      ...overrides.hypotheticals,
    ];

    const totalFundBalance = fundGroups.reduce(
      (sum, fg) => sum + fg.currentBalance,
      0
    );

    const scenarioTimeline = projectTimeline({
      obligations: allScenarioObligations,
      fundGroupBalances: fundGroupBalanceInputs,
      currentFundBalance: totalFundBalance,
      cycleConfig: engineInput.cycleConfig,
      monthsAhead,
    });

    // Use steady-state per-cycle for the scenario snapshot header
    const scenarioSteadyState = calculateSteadyStatePerCycle({
      obligations: allScenarioObligations,
      cycleConfig: engineInput.cycleConfig,
      monthsAhead,
    });

    return NextResponse.json({
      snapshot: { ...scenarioSnapshot, totalContributionPerCycle: scenarioSteadyState },
      timeline: scenarioTimeline,
    });
  } catch (error) {
    logError("failed to calculate what-if scenario", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
