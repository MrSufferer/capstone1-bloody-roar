-- Preserve every legacy message before making conversation membership mandatory.
INSERT INTO conversations (id, kind, "issueId", "createdAt")
SELECT 'work_' || i.id, 'ISSUE_WORK', i.id, CURRENT_TIMESTAMP FROM issues i
WHERE EXISTS (SELECT 1 FROM messages m WHERE m."issueId" = i.id AND m."conversationId" IS NULL)
AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c."issueId" = i.id AND c.kind = 'ISSUE_WORK')
ON CONFLICT DO NOTHING;

INSERT INTO conversation_participants ("conversationId", "userId", role, "joinedAt", "lastReadAt")
SELECT c.id, i."clientId", 'CLIENT', CURRENT_TIMESTAMP,
  (SELECT max(m."readAt") FROM messages m WHERE m."issueId" = i.id AND m."senderId" <> i."clientId")
FROM conversations c JOIN issues i ON i.id = c."issueId" WHERE c.kind = 'ISSUE_WORK'
ON CONFLICT ("conversationId", "userId") DO NOTHING;

INSERT INTO conversation_participants ("conversationId", "userId", role, "joinedAt", "lastReadAt")
SELECT c.id, i."developerId", 'DEVELOPER', CURRENT_TIMESTAMP,
  (SELECT max(m."readAt") FROM messages m WHERE m."issueId" = i.id AND m."senderId" <> i."developerId")
FROM conversations c JOIN issues i ON i.id = c."issueId" WHERE c.kind = 'ISSUE_WORK' AND i."developerId" IS NOT NULL
ON CONFLICT ("conversationId", "userId") DO NOTHING;

UPDATE messages m SET "conversationId" = c.id FROM conversations c
WHERE m."conversationId" IS NULL AND m."issueId" = c."issueId" AND c.kind = 'ISSUE_WORK';
UPDATE conversations c SET "lastMessageAt" = (SELECT max(m."createdAt") FROM messages m WHERE m."conversationId" = c.id);
ALTER TABLE messages ALTER COLUMN "conversationId" SET NOT NULL;
ALTER TABLE messages DROP COLUMN "readAt";
