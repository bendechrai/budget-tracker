import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ obligationId: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { obligationId } = await params;

    // The param can be a fundGroupId directly — check fund group first
    const fundGroup = await prisma.fundGroup.findUnique({
      where: { id: obligationId },
    });

    let fundGroupId: string;

    if (fundGroup && fundGroup.userId === user.id) {
      fundGroupId = fundGroup.id;
    } else {
      // Fall back to looking up via obligation
      const obligation = await prisma.obligation.findUnique({
        where: { id: obligationId },
      });

      if (!obligation || obligation.userId !== user.id) {
        return NextResponse.json(
          { error: "not found" },
          { status: 404 }
        );
      }

      fundGroupId = obligation.fundGroupId;
    }

    const contributions = await prisma.contributionRecord.findMany({
      where: { fundGroupId },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(contributions);
  } catch (error) {
    logError("failed to fetch contributions", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
