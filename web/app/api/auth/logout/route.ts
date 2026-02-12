import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { logError } from "@/lib/logging";

export async function POST(): Promise<NextResponse> {
  try {
    await destroySession();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logError("logout failed", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
