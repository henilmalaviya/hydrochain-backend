/*
  Warnings:

  - Added the required column `creditId` to the `CreditBuyRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amount` to the `CreditIssueRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creditId` to the `CreditRetireRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."CreditBuyRequest" ADD COLUMN     "creditId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."CreditIssueRequest" ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "public"."CreditRetireRequest" ADD COLUMN     "creditId" TEXT NOT NULL;
