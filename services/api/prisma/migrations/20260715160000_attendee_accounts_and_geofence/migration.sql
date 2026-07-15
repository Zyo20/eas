-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'attendee');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "distanceM" DECIMAL(10,2),
ADD COLUMN     "geofenceSkipped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outsideGeofence" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Attendee" ADD COLUMN     "userId" UUID,
ALTER COLUMN "email" SET NOT NULL;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "geofenceRadiusM" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "locationLat" DECIMAL(9,6),
ADD COLUMN     "locationLng" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'admin';

-- CreateIndex
CREATE INDEX "AttendanceRecord_attendeeId_scannedAt_idx" ON "AttendanceRecord"("attendeeId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attendee_userId_key" ON "Attendee"("userId");

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

