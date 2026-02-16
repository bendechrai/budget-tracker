import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { linkExistingTransactionsToObligation } from "@/lib/patterns/linkTransactions";
import type { IntervalUnit } from "@/app/generated/prisma/client";
import { addInterval } from "@/lib/engine/calculate";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface IrregularBaseline {
  amount: number;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  minimumExpected: number | null;
}

function computeIrregularBaseline(
  transactions: { date: Date; amount: number }[]
): IrregularBaseline {
  if (transactions.length === 0) {
    return { amount: 0, intervalUnit: "month", intervalCount: 1, minimumExpected: null };
  }

  const sorted = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const totalAmount = sorted.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const minAmount = Math.min(...sorted.map((t) => Math.abs(t.amount)));

  if (sorted.length === 1) {
    return {
      amount: Math.abs(sorted[0].amount),
      intervalUnit: "month",
      intervalCount: 1,
      minimumExpected: minAmount,
    };
  }

  const spanDays =
    (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) / MS_PER_DAY;

  if (spanDays <= 0) {
    return {
      amount: totalAmount / sorted.length,
      intervalUnit: "month",
      intervalCount: 1,
      minimumExpected: minAmount,
    };
  }

  const perWeek = totalAmount / (spanDays / 7);
  const perMonth = totalAmount / (spanDays / 30);

  // Compute median per-period for conservative estimate
  const amounts = sorted.map((t) => Math.abs(t.amount));
  amounts.sort((a, b) => a - b);
  const median =
    amounts.length % 2 === 0
      ? (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2
      : amounts[Math.floor(amounts.length / 2)];

  if (perWeek < 10) {
    // Use monthly baseline
    const conservativeAmount = Math.min(perMonth, median);
    return {
      amount: Math.round(conservativeAmount * 100) / 100,
      intervalUnit: "month",
      intervalCount: 1,
      minimumExpected: minAmount,
    };
  }

  // Use weekly baseline
  const avgPerTransaction = totalAmount / sorted.length;
  const conservativeAmount = Math.min(perWeek, median);
  // If average transaction is much higher than weekly rate, use weekly
  if (avgPerTransaction > perWeek * 2) {
    return {
      amount: Math.round(conservativeAmount * 100) / 100,
      intervalUnit: "week",
      intervalCount: 1,
      minimumExpected: minAmount,
    };
  }

  return {
    amount: Math.round(conservativeAmount * 100) / 100,
    intervalUnit: "week",
    intervalCount: 1,
    minimumExpected: minAmount,
  };
}

function computeNextDate(
  transactions: { date: Date }[],
  intervalUnit: IntervalUnit,
  intervalCount: number,
  now: Date
): Date {
  if (transactions.length === 0) return now;

  const sorted = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const latest = sorted[sorted.length - 1].date;

  // day/week: always last-transaction + interval
  if (intervalUnit === "day" || intervalUnit === "week") {
    return advanceUntilFuture(latest, intervalUnit, intervalCount, now);
  }

  const dayValues = sorted.map((t) => t.date.getUTCDate());

  if (intervalUnit === "twice_monthly") {
    return computeTwiceMonthlyNext(dayValues, latest, now);
  }

  // month / quarter / year: check day-of-month range
  const range = Math.max(...dayValues) - Math.min(...dayValues);
  if (range <= 7) {
    const anchorDay = computeMedian(dayValues);
    return nextAnchorOccurrence(anchorDay, intervalUnit, intervalCount, now);
  }
  return advanceUntilFuture(latest, intervalUnit, intervalCount, now);
}

function advanceUntilFuture(
  date: Date,
  unit: IntervalUnit,
  count: number,
  now: Date
): Date {
  let current = date;
  while (current < now) {
    const next = addInterval(current, unit, count);
    if (!next) return now;
    current = next;
  }
  return current;
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function daysInTargetMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function nextAnchorOccurrence(
  anchorDay: number,
  unit: IntervalUnit,
  count: number,
  now: Date
): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const clampedDay = Math.min(anchorDay, daysInTargetMonth(year, month));
  let candidate = new Date(Date.UTC(year, month, clampedDay));
  while (candidate < now) {
    const next = addInterval(candidate, unit, count);
    if (!next) return now;
    candidate = next;
  }
  return candidate;
}

function computeTwiceMonthlyNext(
  dayValues: number[],
  latest: Date,
  now: Date
): Date {
  const sortedDays = [...dayValues].sort((a, b) => a - b);
  let bestSplit: { group1: number[]; group2: number[] } | null = null;
  let bestCost = Infinity;

  for (let split = 1; split < sortedDays.length; split++) {
    const group1 = sortedDays.slice(0, split);
    const group2 = sortedDays.slice(split);
    const center1 = Math.round(
      group1.reduce((s, d) => s + d, 0) / group1.length
    );
    const center2 = Math.round(
      group2.reduce((s, d) => s + d, 0) / group2.length
    );
    if (Math.abs(center2 - center1) < 10) continue;

    const cost =
      group1.reduce((s, d) => s + Math.abs(d - center1), 0) +
      group2.reduce((s, d) => s + Math.abs(d - center2), 0);

    if (cost < bestCost) {
      bestCost = cost;
      bestSplit = { group1, group2 };
    }
  }

  if (bestSplit) {
    const range1 = Math.max(...bestSplit.group1) - Math.min(...bestSplit.group1);
    const range2 = Math.max(...bestSplit.group2) - Math.min(...bestSplit.group2);

    if (range1 <= 7 && range2 <= 7) {
      const anchor1 = computeMedian(bestSplit.group1);
      const anchor2 = computeMedian(bestSplit.group2);
      return nextTwiceMonthlyAnchor(anchor1, anchor2, now);
    }
  }

  return advanceUntilFuture(latest, "twice_monthly", 1, now);
}

function nextTwiceMonthlyAnchor(
  day1: number,
  day2: number,
  now: Date
): Date {
  const [earlier, later] = day1 < day2 ? [day1, day2] : [day2, day1];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const dim = daysInTargetMonth(year, month);

  const cand1 = new Date(Date.UTC(year, month, Math.min(earlier, dim)));
  const cand2 = new Date(Date.UTC(year, month, Math.min(later, dim)));

  if (cand1 >= now) return cand1;
  if (cand2 >= now) return cand2;

  // Both passed; use earlier anchor in next month
  const nextMo = (month + 1) % 12;
  const nextYr = month === 11 ? year + 1 : year;
  const nextDim = daysInTargetMonth(nextYr, nextMo);
  return new Date(Date.UTC(nextYr, nextMo, Math.min(earlier, nextDim)));
}

interface AcceptBody {
  action: "accept" | "dismiss";
  name?: string;
  amount?: number;
  intervalUnit?: IntervalUnit | null;
  intervalCount?: number;
  minimumExpected?: number | null;
  nextExpectedDate?: string | null;
  nextDueDate?: string | null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as Partial<AcceptBody>;

    if (!body.action || !["accept", "dismiss"].includes(body.action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'dismiss'" },
        { status: 400 }
      );
    }

    const suggestion = await prisma.suggestion.findUnique({
      where: { id },
      include: {
        suggestionTransactions: {
          include: { transaction: true },
        },
      },
    });

    if (!suggestion || suggestion.userId !== user.id) {
      return NextResponse.json(
        { error: "suggestion not found" },
        { status: 404 }
      );
    }

    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { error: "suggestion is not pending" },
        { status: 400 }
      );
    }

    if (body.action === "dismiss") {
      const updated = await prisma.suggestion.update({
        where: { id },
        data: { status: "dismissed" },
      });
      return NextResponse.json(updated);
    }

    // Accept: create the corresponding IncomeSource or Obligation
    let name = body.name ?? suggestion.vendorPattern;
    let amount = body.amount ?? suggestion.detectedAmount;
    let intervalUnit: IntervalUnit | null = body.intervalUnit !== undefined ? body.intervalUnit : suggestion.detectedIntervalUnit;
    let intervalCount = body.intervalCount ?? suggestion.detectedIntervalCount ?? 1;
    let minimumExpected: number | null = body.minimumExpected ?? suggestion.detectedAmountMin ?? null;
    const now = new Date();

    // Compute baseline for irregular patterns
    if (intervalUnit === null) {
      const transactions = suggestion.suggestionTransactions.map((st) => ({
        date: new Date(st.transaction.date),
        amount: Number(st.transaction.amount),
      }));
      const baseline = computeIrregularBaseline(transactions);
      amount = body.amount ?? baseline.amount;
      intervalUnit = baseline.intervalUnit;
      intervalCount = baseline.intervalCount;
      minimumExpected = baseline.minimumExpected;
      if (!body.name) {
        name = `${suggestion.vendorPattern} (irregular baseline)`;
      }
    }

    const linkedTransactions = suggestion.suggestionTransactions.map((st) => ({
      date: new Date(st.transaction.date),
    }));
    const computedNextDate = intervalUnit
      ? computeNextDate(linkedTransactions, intervalUnit, intervalCount, now)
      : now;

    if (suggestion.type === "income") {
      const result = await prisma.$transaction(async (tx) => {
        const incomeSource = await tx.incomeSource.create({
          data: {
            userId: user.id,
            name,
            expectedAmount: amount,
            intervalUnit,
            intervalCount,
            minimumExpected,
            nextExpectedDate: body.nextExpectedDate ? new Date(body.nextExpectedDate) : computedNextDate,
          },
        });

        const updated = await tx.suggestion.update({
          where: { id },
          data: {
            status: "accepted",
            linkedIncomeSourceId: incomeSource.id,
          },
        });

        return { suggestion: updated, incomeSource };
      });

      return NextResponse.json(result);
    }

    // expense type — create an Obligation
    const result = await prisma.$transaction(async (tx) => {
      // Look up default fund group for this user
      const defaultFundGroup = await tx.fundGroup.findFirst({
        where: { userId: user.id, isDefault: true },
      });

      if (!defaultFundGroup) {
        throw new Error("no default fund group found for user");
      }

      const obligation = await tx.obligation.create({
        data: {
          userId: user.id,
          name,
          type: "recurring",
          amount,
          intervalUnit,
          intervalCount,
          nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : computedNextDate,
          fundGroupId: defaultFundGroup.id,
        },
      });

      const updated = await tx.suggestion.update({
        where: { id },
        data: {
          status: "accepted",
          linkedObligationId: obligation.id,
        },
      });

      return { suggestion: updated, obligation };
    });

    // Link existing unlinked transactions to the new obligation
    try {
      await linkExistingTransactionsToObligation(user.id, {
        id: result.obligation.id,
        name: result.obligation.name,
        amount: result.obligation.amount,
      });
    } catch (linkError) {
      logError("failed to link transactions to accepted suggestion obligation", linkError);
    }

    return NextResponse.json(result);
  } catch (error) {
    logError("failed to update suggestion", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
