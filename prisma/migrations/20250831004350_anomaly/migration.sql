-- AlterTable
ALTER TABLE "public"."CreditBuyRequest" ADD COLUMN     "anomaly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."CreditIssueRequest" ADD COLUMN     "anomaly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."CreditRetireRequest" ADD COLUMN     "anomaly" BOOLEAN NOT NULL DEFAULT false;
