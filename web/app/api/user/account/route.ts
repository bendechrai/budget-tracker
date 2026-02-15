import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { destroySession } from "@/lib/auth/session";
import { logError } from "@/lib/logging";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.confirmation || body.confirmation !== "DELETE") {
      return NextResponse.json(
        { error: "confirmation must be the string \"DELETE\"" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      // Delete in dependency order — children before parents

      // SuggestionTransaction (junction table, depends on Suggestion + Transaction)
      await tx.suggestionTransaction.deleteMany({
        where: {
          OR: [
            { suggestion: { userId: user.id } },
            { transaction: { userId: user.id } },
          ],
        },
      });

      // Suggestions
      await tx.suggestion.deleteMany({ where: { userId: user.id } });

      // Engine snapshots
      await tx.engineSnapshot.deleteMany({ where: { userId: user.id } });

      // AI interaction logs
      await tx.aIInteractionLog.deleteMany({ where: { userId: user.id } });

      // Import logs
      await tx.importLog.deleteMany({ where: { userId: user.id } });

      // Transactions
      await tx.transaction.deleteMany({ where: { userId: user.id } });

      // Escalations (via obligations, cascade handles but explicit is safer in transaction)
      await tx.escalation.deleteMany({
        where: { obligation: { userId: user.id } },
      });

      // Contribution records (via obligations)
      await tx.contributionRecord.deleteMany({
        where: { obligation: { userId: user.id } },
      });

      // Fund balances (via obligations)
      await tx.fundBalance.deleteMany({
        where: { obligation: { userId: user.id } },
      });

      // Custom schedule entries (via obligations)
      await tx.customScheduleEntry.deleteMany({
        where: { obligation: { userId: user.id } },
      });

      // Obligations
      await tx.obligation.deleteMany({ where: { userId: user.id } });

      // Fund groups
      await tx.fundGroup.deleteMany({ where: { userId: user.id } });

      // Income sources
      await tx.incomeSource.deleteMany({ where: { userId: user.id } });

      // Password reset tokens
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

      // Finally, delete the user
      await tx.user.delete({ where: { id: user.id } });
    });

    await destroySession();

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("failed to delete account", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}
