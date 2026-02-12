import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { logError } from "@/lib/logging";

interface LoginBody {
  email: string;
  password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<LoginBody>;

    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const { password } = body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "invalid email or password" },
        { status: 401 }
      );
    }

    await createSession(user.id);

    return NextResponse.json({ id: user.id, email: user.email }, { status: 200 });
  } catch (error) {
    logError("login failed", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
