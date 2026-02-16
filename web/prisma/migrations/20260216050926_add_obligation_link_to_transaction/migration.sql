-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "obligationId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_obligationId_idx" ON "Transaction"("obligationId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
