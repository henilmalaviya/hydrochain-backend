-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "lifeTimeGeneratedCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lifeTimeTransferredCredits" DOUBLE PRECISION NOT NULL DEFAULT 0;
