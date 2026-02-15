import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { calculateWithWhatIf, cycleDaysToConfig } from "@/lib/engine/calculate";
import { generateSnapshot } from "@/lib/engine/snapshot";
import { projectTimeline } from "@/lib/engine/timeline";
import type {
  ObligationInput,
  FundBalanceInput,
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

    const fundBalances = await prisma.fundBalance.findMany({
      where: {
        obligation: {
          userId: user.id,
        },
      },
    });

    const obligationInputs: ObligationInput[] = obligations.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      amount: o.amount,
      frequency: o.frequency,
      frequencyDays: o.frequencyDays,
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

    const fundBalanceInputs: FundBalanceInput[] = fundBalances.map((fb) => ({
      obligationId: fb.obligationId,
      currentBalance: fb.currentBalance,
    }));

    const engineInput = {
      obligations: obligationInputs,
      fundBalances: fundBalanceInputs,
      maxContributionPerCycle: user.maxContributionPerCycle,
      cycleConfig: cycleDaysToConfig(user.contributionCycleDays),
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

    const scenarioTimeline = projectTimeline({
      obligations: allScenarioObligations,
      fundBalances: fundBalanceInputs,
      currentFundBalance: user.currentFundBalance,
      contributionPerCycle: scenario.totalContributionPerCycle,
      cycleConfig: engineInput.cycleConfig,
      monthsAhead,
    });

    return NextResponse.json({
      snapshot: scenarioSnapshot,
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
