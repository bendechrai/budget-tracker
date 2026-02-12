import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const importLogs = await prisma.importLog.findMany({
      where: { userId: user.id },
      orderBy: { importedAt: "desc" },
    });

    return NextResponse.json({ importLogs });
  } catch (error) {
    logError("failed to list import history", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
