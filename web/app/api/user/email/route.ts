import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { verifyPassword } from "@/lib/auth/password";
import { logError } from "@/lib/logging";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.newEmail || typeof body.newEmail !== "string") {
      return NextResponse.json(
        { error: "newEmail is required" },
        { status: 400 },
      );
    }

    if (!body.currentPassword || typeof body.currentPassword !== "string") {
      return NextResponse.json(
        { error: "currentPassword is required" },
        { status: 400 },
      );
    }

    const newEmail = body.newEmail.trim().toLowerCase();

    if (!isValidEmail(newEmail)) {
      return NextResponse.json(
        { error: "invalid email format" },
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

    if (newEmail === user.email) {
      return NextResponse.json(
        { error: "new email must differ from current email" },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: newEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "email already in use" },
        { status: 409 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail },
    });

    return NextResponse.json({ email: newEmail });
  } catch (error) {
    logError("failed to update email", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}
