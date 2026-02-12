import { getSession } from "./session";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging";
import type { User } from "@/app/generated/prisma/client";

export async function getCurrentUser(): Promise<User | null> {
  try {
    const session = await getSession();
    if (!session) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    return user;
  } catch (error) {
    logError("Failed to get current user", error);
    return null;
  }
}
