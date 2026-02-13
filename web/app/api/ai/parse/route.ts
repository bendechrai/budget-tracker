import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { parseNaturalLanguage, MissingApiKeyError } from "@/lib/ai/nlParser";
import { logError } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import type { FinancialContext } from "@/lib/ai/types";

interface ParseBody {
  text: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<ParseBody>;

    if (!body.text || typeof body.text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    const text = body.text.trim();
    if (!text) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Load financial context for the NL parser
    const [incomeSources, obligations] = await Promise.all([
      prisma.incomeSource.findMany({
        where: { userId: user.id, isActive: true },
        select: {
          id: true,
          name: true,
          expectedAmount: true,
          frequency: true,
        },
      }),
      prisma.obligation.findMany({
        where: { userId: user.id, isActive: true },
        select: {
          id: true,
          name: true,
          amount: true,
          frequency: true,
          type: true,
          nextDueDate: true,
        },
      }),
    ]);

    const context: FinancialContext = {
      incomeSources: incomeSources.map((inc) => ({
        id: inc.id,
        name: inc.name,
        expectedAmount: Number(inc.expectedAmount),
        frequency: inc.frequency,
      })),
      obligations: obligations.map((obl) => ({
        id: obl.id,
        name: obl.name,
        amount: Number(obl.amount),
        frequency: obl.frequency,
        type: obl.type,
        nextDueDate: obl.nextDueDate
          ? obl.nextDueDate.toISOString().split("T")[0]
          : null,
      })),
    };

    const result = await parseNaturalLanguage(text, context);

    // For queries, provide a direct answer based on available data
    if (result.type === "query") {
      return NextResponse.json({
        intent: result,
        answer: result.answer ?? result.question,
      });
    }

    // For clarification/unrecognized, return with the message
    if (result.type === "clarification" || result.type === "unrecognized") {
      return NextResponse.json({
        intent: result,
      });
    }

    // For what-if intents, look up matching obligations by name
    if (result.type === "whatif") {
      const obligs = await prisma.obligation.findMany({
        where: { userId: user.id, isActive: true },
        select: { id: true, name: true },
      });

      return NextResponse.json({
        intent: result,
        obligations: obligs,
      });
    }

    // For create/edit/delete intents, return parsed preview data
    return NextResponse.json({
      intent: result,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "missing_api_key", message: "AI features require an API key" },
        { status: 503 }
      );
    }
    logError("failed to parse AI input", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
