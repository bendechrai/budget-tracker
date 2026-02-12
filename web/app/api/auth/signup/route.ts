import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { logError } from "@/lib/logging";

interface SignupBody {
  email: string;
  password: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<SignupBody>;

    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const { password } = body;

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "invalid email format" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    await createSession(user.id, user.onboardingComplete);

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    logError("signup failed", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
