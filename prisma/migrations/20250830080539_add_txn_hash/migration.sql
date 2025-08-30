-- AlterTable
ALTER TABLE "public"."CreditBuyRequest" ADD COLUMN     "txnHash" TEXT;

-- AlterTable
ALTER TABLE "public"."CreditIssueRequest" ADD COLUMN     "txnHash" TEXT;

-- AlterTable
ALTER TABLE "public"."CreditRetireRequest" ADD COLUMN     "txnHash" TEXT;
