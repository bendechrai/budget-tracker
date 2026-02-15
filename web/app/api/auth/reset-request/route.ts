import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging";
import { sendPasswordResetEmail } from "@/lib/email/send";

interface ResetRequestBody {
  email: string;
}

const TOKEN_EXPIRY_HOURS = 1;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<ResetRequestBody>;

    if (!body.email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
      );

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });

      const resetLink = `${request.nextUrl.origin}/reset-password/confirm?token=${token}`;
      sendPasswordResetEmail(email, resetLink).catch(() => {});
    }

    // Always return 200 to prevent email enumeration
    return NextResponse.json({
      message: "if an account with that email exists, a reset link has been sent",
    });
  } catch (error) {
    logError("password reset request failed", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
