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
      orderBy: {
        createdAt: "desc",
      },
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
