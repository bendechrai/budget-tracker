-- CreateEnum
CREATE TYPE "ObligationType" AS ENUM ('recurring', 'recurring_with_end', 'one_off', 'custom');

-- CreateTable
CREATE TABLE "FundGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ObligationType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" "IncomeFrequency",
    "frequencyDays" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "fundGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomScheduleEntry" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CustomScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundGroup_userId_idx" ON "FundGroup"("userId");

-- CreateIndex
CREATE INDEX "Obligation_userId_idx" ON "Obligation"("userId");

-- CreateIndex
CREATE INDEX "Obligation_fundGroupId_idx" ON "Obligation"("fundGroupId");

-- CreateIndex
CREATE INDEX "CustomScheduleEntry_obligationId_idx" ON "CustomScheduleEntry"("obligationId");

-- AddForeignKey
ALTER TABLE "FundGroup" ADD CONSTRAINT "FundGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_fundGroupId_fkey" FOREIGN KEY ("fundGroupId") REFERENCES "FundGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomScheduleEntry" ADD CONSTRAINT "CustomScheduleEntry_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
