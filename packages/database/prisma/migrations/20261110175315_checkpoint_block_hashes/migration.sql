-- AlterTable
ALTER TABLE "projection_checkpoints" ADD COLUMN     "canonicalBlockHashes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "reorgAlerted" BOOLEAN NOT NULL DEFAULT false;
