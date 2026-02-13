-- CreateEnum
CREATE TYPE "EscalationChangeType" AS ENUM ('absolute', 'percentage', 'fixed_increase');

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "changeType" "EscalationChangeType" NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "intervalMonths" INTEGER,
    "isApplied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Escalation_obligationId_idx" ON "Escalation"("obligationId");

-- CreateIndex (partial unique: at most one recurring rule per obligation)
CREATE UNIQUE INDEX "Escalation_unique_recurring_per_obligation"
    ON "Escalation"("obligationId")
    WHERE "intervalMonths" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
