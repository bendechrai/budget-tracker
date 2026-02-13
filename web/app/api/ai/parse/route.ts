import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { parseNaturalLanguage } from "@/lib/ai/nlParser";
import { logError } from "@/lib/logging";
import { prisma } from "@/lib/prisma";

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

    const result = parseNaturalLanguage(text);

    // For queries, provide a direct answer based on available data
    if (result.type === "query") {
      return NextResponse.json({
        intent: result,
        answer: result.question,
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
      const obligations = await prisma.obligation.findMany({
        where: { userId: user.id, isActive: true },
        select: { id: true, name: true },
      });

      return NextResponse.json({
        intent: result,
        obligations,
      });
    }

    // For create/edit/delete intents, return parsed preview data
    return NextResponse.json({
      intent: result,
    });
  } catch (error) {
    logError("failed to parse AI input", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
