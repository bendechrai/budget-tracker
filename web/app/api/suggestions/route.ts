import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const suggestions = await prisma.suggestion.findMany({
      where: {
        userId: user.id,
        status: "pending",
      },
      include: {
        suggestionTransactions: {
          include: {
            transaction: {
              select: {
                id: true,
                date: true,
                description: true,
                amount: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: [
        { confidence: "asc" },
        { createdAt: "desc" },
      ],
    });

    // Within each confidence tier, sort by amount consistency:
    // fixed-amount suggestions first, then by ascending range spread %
    const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => {
      const confDiff = (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3);
      if (confDiff !== 0) return confDiff;

      const spreadA = a.detectedAmountMin != null && a.detectedAmountMax != null && a.detectedAmount > 0
        ? (a.detectedAmountMax - a.detectedAmountMin) / a.detectedAmount
        : 0;
      const spreadB = b.detectedAmountMin != null && b.detectedAmountMax != null && b.detectedAmount > 0
        ? (b.detectedAmountMax - b.detectedAmountMin) / b.detectedAmount
        : 0;
      if (spreadA !== spreadB) return spreadA - spreadB;

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return NextResponse.json({
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    logError("failed to list suggestions", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
