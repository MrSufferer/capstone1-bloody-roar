UPDATE attachments a SET "conversationId" = m."conversationId", purpose = 'CHAT', status = 'ATTACHED'
FROM messages m WHERE a."messageId" = m.id;
