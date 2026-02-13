import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { logError } from "@/lib/logging";

interface ResetConfirmBody {
  token: string;
  password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<ResetConfirmBody>;

    if (!body.token || !body.password) {
      return NextResponse.json(
        { error: "token and password are required" },
        { status: 400 }
      );
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: body.token },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "invalid or expired reset token" },
        { status: 400 }
      );
    }

    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: "reset token has already been used" },
        { status: 400 }
      );
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "invalid or expired reset token" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(body.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message: "password has been reset" });
  } catch (error) {
    logError("password reset confirm failed", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
