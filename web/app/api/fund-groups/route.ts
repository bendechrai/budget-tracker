import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";

interface CreateFundGroupBody {
  name: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const fundGroups = await prisma.fundGroup.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(fundGroups);
  } catch (error) {
    logError("failed to fetch fund groups", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<CreateFundGroupBody>;

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

    const fundGroup = await prisma.fundGroup.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
      },
    });

    return NextResponse.json(fundGroup, { status: 201 });
  } catch (error) {
    logError("failed to create fund group", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
