import { chromium, type FullConfig } from "@playwright/test";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/auth/password";

const TEST_USER_EMAIL = "e2e-test@example.com";
const TEST_USER_PASSWORD = "test-password-123";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function globalSetup(config: FullConfig): Promise<void> {
  const prisma = createPrismaClient();

  try {
    // Clean up any leftover test data from previous runs
    const existingUser = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
    });
    if (existingUser) {
      await cleanupUser(prisma, existingUser.id);
    }

    // Create test user with onboardingComplete=true
    const passwordHash = await hashPassword(TEST_USER_PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        passwordHash,
        onboardingComplete: true,
        currentFundBalance: 1000,
        maxContributionPerCycle: 500,
        contributionCycleDays: 14,
        currencySymbol: "$",
      },
    });

    // Seed sample income source
    await prisma.incomeSource.create({
      data: {
        userId: user.id,
        name: "Test Salary",
        expectedAmount: 5000,
        frequency: "monthly",
        isIrregular: false,
        nextExpectedDate: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000
        ),
      },
    });

    // Seed sample obligation
    await prisma.obligation.create({
      data: {
        userId: user.id,
        name: "Test Rent",
        type: "recurring",
        amount: 1500,
        frequency: "monthly",
        startDate: new Date(),
        nextDueDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
      },
    });

    // Log in via the API and save storageState
    const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
    const browser = await chromium.launch();
    const context = await browser.newContext();

    const response = await context.request.post(`${baseURL}/api/auth/login`, {
      data: {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Login failed with status ${response.status()}: ${await response.text()}`
      );
    }

    await context.storageState({ path: "./e2e/.auth/storageState.json" });
    await browser.close();
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupUser(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  // Delete in dependency order
  await prisma.aIInteractionLog.deleteMany({ where: { userId } });
  await prisma.engineSnapshot.deleteMany({ where: { userId } });
  await prisma.suggestionTransaction.deleteMany({
    where: { suggestion: { userId } },
  });
  await prisma.suggestion.deleteMany({ where: { userId } });
  await prisma.importLog.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.contributionRecord.deleteMany({
    where: { obligation: { userId } },
  });
  await prisma.fundBalance.deleteMany({
    where: { obligation: { userId } },
  });
  await prisma.escalation.deleteMany({
    where: { obligation: { userId } },
  });
  await prisma.customScheduleEntry.deleteMany({
    where: { obligation: { userId } },
  });
  await prisma.obligation.deleteMany({ where: { userId } });
  await prisma.fundGroup.deleteMany({ where: { userId } });
  await prisma.incomeSource.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

export default globalSetup;
