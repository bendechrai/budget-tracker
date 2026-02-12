import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

interface UpdateFundGroupBody {
  name: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.fundGroup.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const body = (await request.json()) as Partial<UpdateFundGroupBody>;

    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const updated = await prisma.fundGroup.update({
      where: { id },
      data: { name: body.name.trim() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logError("failed to update fund group", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

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

    const existing = await prisma.fundGroup.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await prisma.obligation.updateMany({
      where: { fundGroupId: id },
      data: { fundGroupId: null },
    });

    await prisma.fundGroup.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("failed to delete fund group", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
