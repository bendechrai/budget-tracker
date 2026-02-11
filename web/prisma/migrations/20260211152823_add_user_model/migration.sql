-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "currencySymbol" TEXT NOT NULL DEFAULT '$',
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "currentFundBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxContributionPerCycle" DOUBLE PRECISION,
    "contributionCycleDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
