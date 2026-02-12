-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "SuggestionConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'accepted', 'dismissed');

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SuggestionType" NOT NULL,
    "vendorPattern" TEXT NOT NULL,
    "detectedAmount" DOUBLE PRECISION NOT NULL,
    "detectedAmountMin" DOUBLE PRECISION,
    "detectedAmountMax" DOUBLE PRECISION,
    "detectedFrequency" "IncomeFrequency" NOT NULL,
    "confidence" "SuggestionConfidence" NOT NULL,
    "matchingTransactionCount" INTEGER NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "linkedIncomeSourceId" TEXT,
    "linkedObligationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionTransaction" (
    "suggestionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "SuggestionTransaction_pkey" PRIMARY KEY ("suggestionId","transactionId")
);

-- CreateIndex
CREATE INDEX "Suggestion_userId_idx" ON "Suggestion"("userId");

-- CreateIndex
CREATE INDEX "Suggestion_status_idx" ON "Suggestion"("status");

-- CreateIndex
CREATE INDEX "SuggestionTransaction_transactionId_idx" ON "SuggestionTransaction"("transactionId");

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_linkedIncomeSourceId_fkey" FOREIGN KEY ("linkedIncomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_linkedObligationId_fkey" FOREIGN KEY ("linkedObligationId") REFERENCES "Obligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionTransaction" ADD CONSTRAINT "SuggestionTransaction_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionTransaction" ADD CONSTRAINT "SuggestionTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
