import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { logError } from "@/lib/logging";

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.currentPassword || typeof body.currentPassword !== "string") {
      return NextResponse.json(
        { error: "currentPassword is required" },
        { status: 400 },
      );
    }

    if (!body.newPassword || typeof body.newPassword !== "string") {
      return NextResponse.json(
        { error: "newPassword is required" },
        { status: 400 },
      );
    }

    if (body.newPassword.length < 8) {
      return NextResponse.json(
        { error: "new password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const passwordValid = await verifyPassword(
      body.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      return NextResponse.json(
        { error: "incorrect password" },
        { status: 403 },
      );
    }

    const isSamePassword = await verifyPassword(
      body.newPassword,
      user.passwordHash,
    );
    if (isSamePassword) {
      return NextResponse.json(
        { error: "new password must differ from current password" },
        { status: 400 },
      );
    }

    const newHash = await hashPassword(body.newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("failed to update password", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}
