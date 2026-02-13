import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TEST_USER_EMAIL = "e2e-test@example.com";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function globalTeardown(): Promise<void> {
  const prisma = createPrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
    });

    if (user) {
      // Delete in dependency order
      await prisma.aIInteractionLog.deleteMany({ where: { userId: user.id } });
      await prisma.engineSnapshot.deleteMany({ where: { userId: user.id } });
      await prisma.suggestionTransaction.deleteMany({
        where: { suggestion: { userId: user.id } },
      });
      await prisma.suggestion.deleteMany({ where: { userId: user.id } });
      await prisma.importLog.deleteMany({ where: { userId: user.id } });
      await prisma.transaction.deleteMany({ where: { userId: user.id } });
      await prisma.contributionRecord.deleteMany({
        where: { obligation: { userId: user.id } },
      });
      await prisma.fundBalance.deleteMany({
        where: { obligation: { userId: user.id } },
      });
      await prisma.escalation.deleteMany({
        where: { obligation: { userId: user.id } },
      });
      await prisma.customScheduleEntry.deleteMany({
        where: { obligation: { userId: user.id } },
      });
      await prisma.obligation.deleteMany({ where: { userId: user.id } });
      await prisma.fundGroup.deleteMany({ where: { userId: user.id } });
      await prisma.incomeSource.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });
      await prisma.user.delete({ where: { id: user.id } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

export default globalTeardown;
