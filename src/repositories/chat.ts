import type {PoolClient} from "pg";
import { database,transaction } from "../lib/db/pool";
import type {ChatSession} from "../features/workspace/data";
import type {ChatAction} from "../features/workspace/chat";

type Connection = PoolClient|ReturnType<typeof database>;

export async function readChat(userId:string,connection:Connection=database()):Promise<ChatSession[]> {
  const result = await connection.query<ChatSession>(`
    SELECT s.id,s.title,COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'content',m.content) ORDER BY m.created_at,m.position)
      FROM chat_messages m WHERE m.user_id=s.user_id AND m.session_id=s.id AND m.role IN ('user','assistant')
    ),'[]'::jsonb) AS messages
    FROM chat_sessions s WHERE s.user_id=$1 ORDER BY COALESCE(s.last_message_at,s.created_at) DESC,s.id`,[userId]);
  return result.rows;
}

export async function hasChat(client:PoolClient,userId:string) {
  const result = await client.query("SELECT 1 FROM chat_sessions WHERE user_id=$1 LIMIT 1",[userId]);
  return Boolean(result.rowCount);
}

export async function importChat(client:PoolClient,userId:string,sessions:ChatSession[]) {
  const time = Date.now();
  for (const [index,session] of sessions.entries()) {
    const created = await client.query<{id:string}>(
      "INSERT INTO chat_sessions(user_id,title,last_message_at) VALUES ($1,$2,$3) RETURNING id",
      [userId,session.title,new Date(time-index)]);
    await client.query(`
      INSERT INTO chat_messages(user_id,session_id,role,content)
      SELECT $1,$2,item.value->>'role',item.value->>'content'
      FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS item(value,ordering)
      ORDER BY item.ordering`,[userId,created.rows[0].id,JSON.stringify(session.messages)]);
  }
  return readChat(userId,client);
}

export async function changeChat(userId:string,action:ChatAction) {
  return transaction(async client=>{
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
    if (action.action==="clear") {
      await client.query("DELETE FROM chat_sessions WHERE user_id=$1",[userId]);
      return [];
    }

    if (action.action==="start") {
      await client.query("INSERT INTO chat_sessions(id,user_id,title) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [action.sessionId,userId,action.title]);
    }
    const owned = await client.query("SELECT 1 FROM chat_sessions WHERE id=$1 AND user_id=$2",[action.sessionId,userId]);
    if (!owned.rowCount) return null;

    if (action.action==="delete") {
      await client.query("DELETE FROM chat_sessions WHERE id=$1 AND user_id=$2",[action.sessionId,userId]);
    } else if (action.action==="rename") {
      await client.query("UPDATE chat_sessions SET title=$3 WHERE id=$1 AND user_id=$2",[action.sessionId,userId,action.title]);
    } else {
      const replyTo = action.action==="reply" ? action.replyTo : null;
      if (replyTo) {
        const prompt = await client.query("SELECT 1 FROM chat_messages WHERE id=$1 AND user_id=$2 AND session_id=$3 AND role='user'",
          [replyTo,userId,action.sessionId]);
        if (!prompt.rowCount) return null;
      }
      const inserted = await client.query(`
        INSERT INTO chat_messages(id,user_id,session_id,role,content,reply_to)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [action.messageId,userId,action.sessionId,replyTo ? "assistant" : "user",action.content,replyTo]);
      if (!inserted.rowCount) {
        const replay = await client.query(`
          SELECT 1 FROM chat_messages WHERE user_id=$1 AND session_id=$2
            AND ((id=$3 AND content=$4 AND reply_to IS NOT DISTINCT FROM $5::uuid) OR ($5::uuid IS NOT NULL AND reply_to=$5))`,
        [userId,action.sessionId,action.messageId,action.content,replyTo]);
        if (!replay.rowCount) throw new ChatWriteConflict();
      } else {
        await client.query("UPDATE chat_sessions SET last_message_at=now() WHERE id=$1 AND user_id=$2",[action.sessionId,userId]);
      }
    }
    return readChat(userId,client);
  });
}

export class ChatWriteConflict extends Error {}
