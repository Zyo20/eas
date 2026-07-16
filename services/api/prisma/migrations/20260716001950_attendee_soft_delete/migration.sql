-- Add soft-delete column to Attendee
ALTER TABLE "Attendee" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Replace the strict (organizationId, identifier) unique constraint with a
-- PARTIAL unique index that only applies to non-deleted rows. This lets an
-- admin re-create an attendee with the same identifier after a soft delete.
DROP INDEX "Attendee_organizationId_identifier_key";
CREATE UNIQUE INDEX "Attendee_organizationId_identifier_active_key"
  ON "Attendee"("organizationId", "identifier")
  WHERE "deletedAt" IS NULL;

-- Helpful index for filtering out soft-deleted rows from list queries.
CREATE INDEX "Attendee_organizationId_deletedAt_idx"
  ON "Attendee"("organizationId", "deletedAt");
