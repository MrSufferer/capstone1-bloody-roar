-- AlterTable
ALTER TABLE "claimable_balances" ADD COLUMN     "autoClaimAt" TIMESTAMP(3),
ADD COLUMN     "autoClaimTxHash" TEXT;

