-- AlterEnum
ALTER TYPE "public"."CreditBuyRequestStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "public"."CreditBuyRequest" ADD COLUMN     "status" "public"."CreditBuyRequestStatus" NOT NULL DEFAULT 'PENDING';
