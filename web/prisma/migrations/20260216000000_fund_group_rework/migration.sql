-- 1. Add columns to FundGroup
ALTER TABLE "FundGroup" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FundGroup" ADD COLUMN "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 2. Create default fund group for every user that doesn't have one
INSERT INTO "FundGroup" ("id", "userId", "name", "isDefault", "currentBalance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", 'Default Sinking Fund', true, 0, NOW(), NOW()
FROM "User" u
WHERE u."id" NOT IN (SELECT "userId" FROM "FundGroup" WHERE "isDefault" = true);

-- 3. Migrate per-obligation balances to fund groups
-- For obligations already in a fund group, sum their balances into the group
UPDATE "FundGroup" fg
SET "currentBalance" = COALESCE((
  SELECT SUM(fb."currentBalance")
  FROM "FundBalance" fb
  JOIN "Obligation" o ON o."id" = fb."obligationId"
  WHERE o."fundGroupId" = fg."id"
), 0);

-- For obligations with no fund group, sum their balances into the user's default group
UPDATE "FundGroup" fg
SET "currentBalance" = fg."currentBalance" + COALESCE((
  SELECT SUM(fb."currentBalance")
  FROM "FundBalance" fb
  JOIN "Obligation" o ON o."id" = fb."obligationId"
  WHERE o."fundGroupId" IS NULL AND o."userId" = fg."userId"
), 0)
WHERE fg."isDefault" = true;

-- 4. Assign ungrouped obligations to their user's default fund group
UPDATE "Obligation" o
SET "fundGroupId" = (
  SELECT fg."id" FROM "FundGroup" fg
  WHERE fg."userId" = o."userId" AND fg."isDefault" = true
  LIMIT 1
)
WHERE o."fundGroupId" IS NULL;

-- 5. Make fundGroupId NOT NULL
ALTER TABLE "Obligation" ALTER COLUMN "fundGroupId" SET NOT NULL;

-- 6. Migrate ContributionRecord from obligationId to fundGroupId
ALTER TABLE "ContributionRecord" ADD COLUMN "fundGroupId" TEXT;

UPDATE "ContributionRecord" cr
SET "fundGroupId" = (
  SELECT o."fundGroupId" FROM "Obligation" o WHERE o."id" = cr."obligationId"
);

-- For any orphaned records where the obligation doesn't exist, use a fallback
UPDATE "ContributionRecord" cr
SET "fundGroupId" = (
  SELECT fg."id" FROM "FundGroup" fg
  WHERE fg."isDefault" = true
  LIMIT 1
)
WHERE cr."fundGroupId" IS NULL;

ALTER TABLE "ContributionRecord" ALTER COLUMN "fundGroupId" SET NOT NULL;

-- Drop the old foreign key and index on obligationId
ALTER TABLE "ContributionRecord" DROP CONSTRAINT IF EXISTS "ContributionRecord_obligationId_fkey";
DROP INDEX IF EXISTS "ContributionRecord_obligationId_idx";
ALTER TABLE "ContributionRecord" DROP COLUMN "obligationId";

-- 7. Add index and foreign key for ContributionRecord.fundGroupId
CREATE INDEX "ContributionRecord_fundGroupId_idx" ON "ContributionRecord"("fundGroupId");
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_fundGroupId_fkey"
  FOREIGN KEY ("fundGroupId") REFERENCES "FundGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Drop FundBalance table
DROP TABLE "FundBalance";

-- 9. Drop the old nullable foreign key on Obligation.fundGroupId and recreate as non-nullable
ALTER TABLE "Obligation" DROP CONSTRAINT IF EXISTS "Obligation_fundGroupId_fkey";
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_fundGroupId_fkey"
  FOREIGN KEY ("fundGroupId") REFERENCES "FundGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
