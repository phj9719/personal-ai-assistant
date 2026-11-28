BEGIN;

ALTER TABLE chat_messages
  ADD COLUMN position bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN reply_to uuid,
  ADD CONSTRAINT chat_messages_reply_to_fkey
    FOREIGN KEY (user_id, reply_to) REFERENCES chat_messages(user_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX chat_messages_one_reply
  ON chat_messages (user_id, reply_to) WHERE reply_to IS NOT NULL;

ALTER TABLE chat_messages
  DROP CONSTRAINT chat_messages_user_id_session_id_fkey,
  ADD CONSTRAINT chat_messages_user_id_session_id_fkey
    FOREIGN KEY (user_id, session_id) REFERENCES chat_sessions(user_id, id) ON DELETE CASCADE;

ALTER TABLE chat_memories
  DROP CONSTRAINT chat_memories_user_id_source_message_id_fkey,
  ADD CONSTRAINT chat_memories_user_id_source_message_id_fkey
    FOREIGN KEY (user_id, source_message_id) REFERENCES chat_messages(user_id, id)
    ON DELETE SET NULL (source_message_id);

ALTER TABLE ai_execution_logs
  DROP CONSTRAINT ai_execution_logs_user_id_message_id_fkey,
  ADD CONSTRAINT ai_execution_logs_user_id_message_id_fkey
    FOREIGN KEY (user_id, message_id) REFERENCES chat_messages(user_id, id) ON DELETE CASCADE;

-- The old document contains no individual message timestamps. Keep session and message order.
WITH legacy AS MATERIALIZED (
  SELECT doc.user_id, chat.session, chat.ordinality, doc.updated_at,
    gen_random_uuid() AS session_id
  FROM workspace_documents AS doc
  CROSS JOIN LATERAL jsonb_array_elements(doc.payload) WITH ORDINALITY AS chat(session, ordinality)
  WHERE doc.domain='chat'
), sessions AS (
  INSERT INTO chat_sessions (id,user_id,title,last_message_at)
  SELECT session_id,user_id,session->>'title',updated_at-ordinality*interval '1 millisecond'
  FROM legacy RETURNING id
)
INSERT INTO chat_messages(user_id,session_id,role,content)
SELECT legacy.user_id,sessions.id,message.data->>'role',message.data->>'content'
FROM legacy JOIN sessions ON sessions.id=legacy.session_id
CROSS JOIN LATERAL jsonb_array_elements(legacy.session->'messages') WITH ORDINALITY AS message(data,ordinality)
ORDER BY sessions.id,message.ordinality;

DELETE FROM workspace_documents WHERE domain='chat';

-- Prevent an older application instance from writing a second copy after migration.
ALTER TABLE workspace_documents
  DROP CONSTRAINT workspace_documents_domain_check,
  DROP CONSTRAINT workspace_documents_check,
  ADD CONSTRAINT workspace_documents_domain_check
    CHECK (domain IN ('records','utilities','finance','memories','theme','settlements','baseball')),
  ADD CONSTRAINT workspace_documents_check CHECK (
    (domain IN ('records','utilities','finance','baseball') AND jsonb_typeof(payload) = 'object')
    OR (domain IN ('memories','settlements') AND jsonb_typeof(payload) = 'array')
    OR (domain = 'theme' AND payload IN ('"light"'::jsonb,'"dark"'::jsonb))
  );

COMMIT;
