import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Find the escalation and verify ownership via obligation
    const escalation = await prisma.escalation.findUnique({
      where: { id },
      include: { obligation: true },
    });

    if (!escalation) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (escalation.obligation.userId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await prisma.escalation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("failed to delete escalation", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
