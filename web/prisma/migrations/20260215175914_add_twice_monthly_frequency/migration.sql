-- AlterEnum
ALTER TYPE "IncomeFrequency" ADD VALUE 'twice_monthly';

-- DropIndex
DROP INDEX "Escalation_unique_recurring_per_obligation";
