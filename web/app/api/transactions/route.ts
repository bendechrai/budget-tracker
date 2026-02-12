import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
    const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_SIZE);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) {
      const parsed = new Date(startDate);
      if (!isNaN(parsed.getTime())) {
        dateFilter.gte = parsed;
      }
    }
    if (endDate) {
      const parsed = new Date(endDate);
      if (!isNaN(parsed.getTime())) {
        dateFilter.lte = parsed;
      }
    }

    const where: { userId: string; date?: { gte?: Date; lte?: Date } } = {
      userId: user.id,
    };
    if (dateFilter.gte || dateFilter.lte) {
      where.date = dateFilter;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logError("failed to list transactions", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
