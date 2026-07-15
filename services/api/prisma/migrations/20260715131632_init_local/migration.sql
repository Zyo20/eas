-- AlterTable
ALTER TABLE "User" ADD COLUMN     "setupTokenJti" TEXT,
ADD COLUMN     "setupTokenUsedAt" TIMESTAMP(3);
