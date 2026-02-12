-- CreateEnum
CREATE TYPE "ContributionType" AS ENUM ('contribution', 'manual_adjustment');

-- CreateTable
CREATE TABLE "FundBalance" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionRecord" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "ContributionType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRequired" DOUBLE PRECISION NOT NULL,
    "totalFunded" DOUBLE PRECISION NOT NULL,
    "nextActionAmount" DOUBLE PRECISION NOT NULL,
    "nextActionDate" TIMESTAMP(3) NOT NULL,
    "nextActionDescription" TEXT NOT NULL,

    CONSTRAINT "EngineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundBalance_obligationId_key" ON "FundBalance"("obligationId");

-- CreateIndex
CREATE INDEX "ContributionRecord_obligationId_idx" ON "ContributionRecord"("obligationId");

-- CreateIndex
CREATE INDEX "EngineSnapshot_userId_idx" ON "EngineSnapshot"("userId");

-- AddForeignKey
ALTER TABLE "FundBalance" ADD CONSTRAINT "FundBalance_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineSnapshot" ADD CONSTRAINT "EngineSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
