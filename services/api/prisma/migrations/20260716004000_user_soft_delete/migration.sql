-- Add soft-delete column to User.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Replace the strict email unique constraint with a PARTIAL unique index
-- that only applies to non-deleted users. Mirrors the Attendee migration
-- (20260716001950_attendee_soft_delete) so soft-deleted users free up their
-- email for re-use when an admin re-creates the attendee.
--
-- The existing "User_email_key" was created by Prisma's @unique on the model.
-- DROP INDEX removes it; the new partial index replaces it.
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_email_active_key"
  ON "User"("email")
  WHERE "deletedAt" IS NULL;

-- Helpful index for filtering active users (login path, me path, etc.).
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
