-- CreateEnum
CREATE TYPE "SourceSnapshotStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "TestRunKind" AS ENUM ('BASE_CHECK', 'SUBMISSION');

-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "TestFramework" AS ENUM ('VITEST', 'PYTEST');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('ISSUE_WORK', 'APPLICATION');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('CLIENT', 'DEVELOPER', 'APPLICANT', 'ADMIN');

-- AlterEnum
ALTER TYPE "AttachmentPurpose" ADD VALUE 'SOURCE';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "conversationId" TEXT;

-- AlterTable
ALTER TABLE "test_cases" ADD COLUMN     "baseStatus" TEXT,
ADD COLUMN     "expectBaseFail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "testCode" TEXT,
ADD COLUMN     "testFilePath" TEXT;

-- CreateTable
CREATE TABLE "source_snapshots" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "repoUrl" TEXT,
    "ref" TEXT,
    "commitSha" TEXT,
    "attachmentId" TEXT,
    "framework" "TestFramework",
    "installCommand" TEXT,
    "storagePath" TEXT,
    "sha256" TEXT,
    "context" TEXT,
    "status" "SourceSnapshotStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "submissionId" TEXT,
    "kind" "TestRunKind" NOT NULL,
    "status" "TestRunStatus" NOT NULL DEFAULT 'QUEUED',
    "bundleSha256" TEXT NOT NULL,
    "patchSha256" TEXT,
    "results" JSONB,
    "log" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "issueId" TEXT NOT NULL,
    "applicationId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_snapshots_issueId_key" ON "source_snapshots"("issueId");

-- CreateIndex
CREATE INDEX "test_runs_issueId_createdAt_idx" ON "test_runs"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "test_runs_status_createdAt_idx" ON "test_runs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_applicationId_key" ON "conversations"("applicationId");

-- CreateIndex
CREATE INDEX "conversations_issueId_kind_idx" ON "conversations"("issueId", "kind");

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE UNIQUE INDEX conversations_issue_work_key ON conversations("issueId") WHERE kind = 'ISSUE_WORK';
CREATE UNIQUE INDEX test_runs_one_active_per_issue ON test_runs("issueId") WHERE status IN ('QUEUED', 'RUNNING');
