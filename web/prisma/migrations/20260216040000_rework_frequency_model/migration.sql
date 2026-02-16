-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('day', 'week', 'twice_monthly', 'month', 'quarter', 'year');

-- Step 1: Add new columns to IncomeSource
ALTER TABLE "IncomeSource" ADD COLUMN "intervalUnit" "IntervalUnit";
ALTER TABLE "IncomeSource" ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1;

-- Step 2: Transform IncomeSource data
UPDATE "IncomeSource" SET "intervalUnit" = 'week', "intervalCount" = 1 WHERE "frequency" = 'weekly';
UPDATE "IncomeSource" SET "intervalUnit" = 'week', "intervalCount" = 2 WHERE "frequency" = 'fortnightly';
UPDATE "IncomeSource" SET "intervalUnit" = 'twice_monthly', "intervalCount" = 1 WHERE "frequency" = 'twice_monthly';
UPDATE "IncomeSource" SET "intervalUnit" = 'month', "intervalCount" = 1 WHERE "frequency" = 'monthly';
UPDATE "IncomeSource" SET "intervalUnit" = 'quarter', "intervalCount" = 1 WHERE "frequency" = 'quarterly';
UPDATE "IncomeSource" SET "intervalUnit" = 'year', "intervalCount" = 1 WHERE "frequency" = 'annual';
UPDATE "IncomeSource" SET "intervalUnit" = 'day', "intervalCount" = COALESCE("frequencyDays", 1) WHERE "frequency" = 'custom';
UPDATE "IncomeSource" SET "intervalUnit" = NULL WHERE "frequency" = 'irregular';

-- Step 3: Drop old columns from IncomeSource
ALTER TABLE "IncomeSource" DROP COLUMN "frequency";
ALTER TABLE "IncomeSource" DROP COLUMN "frequencyDays";
ALTER TABLE "IncomeSource" DROP COLUMN "isIrregular";

-- Step 4: Add new columns to Obligation
ALTER TABLE "Obligation" ADD COLUMN "intervalUnit" "IntervalUnit";
ALTER TABLE "Obligation" ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1;

-- Step 5: Transform Obligation data
UPDATE "Obligation" SET "intervalUnit" = 'week', "intervalCount" = 1 WHERE "frequency" = 'weekly';
UPDATE "Obligation" SET "intervalUnit" = 'week', "intervalCount" = 2 WHERE "frequency" = 'fortnightly';
UPDATE "Obligation" SET "intervalUnit" = 'month', "intervalCount" = 1 WHERE "frequency" = 'twice_monthly';
UPDATE "Obligation" SET "intervalUnit" = 'month', "intervalCount" = 1 WHERE "frequency" = 'monthly';
UPDATE "Obligation" SET "intervalUnit" = 'quarter', "intervalCount" = 1 WHERE "frequency" = 'quarterly';
UPDATE "Obligation" SET "intervalUnit" = 'year', "intervalCount" = 1 WHERE "frequency" = 'annual';
UPDATE "Obligation" SET "intervalUnit" = 'day', "intervalCount" = COALESCE("frequencyDays", 1) WHERE "frequency" = 'custom';
UPDATE "Obligation" SET "intervalUnit" = NULL WHERE "frequency" = 'irregular';

-- Step 6: Drop old columns from Obligation
ALTER TABLE "Obligation" DROP COLUMN "frequency";
ALTER TABLE "Obligation" DROP COLUMN "frequencyDays";
ALTER TABLE "Obligation" DROP COLUMN "startDate";

-- Step 7: Add new columns to Suggestion
ALTER TABLE "Suggestion" ADD COLUMN "detectedIntervalUnit" "IntervalUnit";
ALTER TABLE "Suggestion" ADD COLUMN "detectedIntervalCount" INTEGER NOT NULL DEFAULT 1;

-- Step 8: Transform Suggestion data
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'week', "detectedIntervalCount" = 1 WHERE "detectedFrequency" = 'weekly';
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'week', "detectedIntervalCount" = 2 WHERE "detectedFrequency" = 'fortnightly';
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'twice_monthly', "detectedIntervalCount" = 1 WHERE "detectedFrequency" = 'twice_monthly';
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'month', "detectedIntervalCount" = 1 WHERE "detectedFrequency" = 'monthly';
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'quarter', "detectedIntervalCount" = 1 WHERE "detectedFrequency" = 'quarterly';
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'year', "detectedIntervalCount" = 1 WHERE "detectedFrequency" = 'annual';
UPDATE "Suggestion" SET "detectedIntervalUnit" = 'day', "detectedIntervalCount" = 1 WHERE "detectedFrequency" = 'custom';
UPDATE "Suggestion" SET "detectedIntervalUnit" = NULL WHERE "detectedFrequency" = 'irregular';

-- Step 9: Drop old column from Suggestion
ALTER TABLE "Suggestion" DROP COLUMN "detectedFrequency";

-- Step 10: Drop the old enum
DROP TYPE "IncomeFrequency";
