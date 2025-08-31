/*
  Warnings:

  - You are about to drop the column `renewableEnergyProofId` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "renewableEnergyProofId",
ADD COLUMN     "did" TEXT;
