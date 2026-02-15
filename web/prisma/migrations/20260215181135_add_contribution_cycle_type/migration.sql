-- CreateEnum
CREATE TYPE "ContributionCycleType" AS ENUM ('weekly', 'fortnightly', 'twice_monthly', 'monthly');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "contributionCycleType" "ContributionCycleType",
ADD COLUMN     "contributionPayDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
