import type {PoolClient} from "pg";
import {database,transaction} from "../lib/db/pool";
import {hasChat,importChat} from "./chat";
import type {ChatSession, Documents, Domain, Revisioned} from "../features/workspace/data";

async function documentsFor(userId:string,client:PoolClient|ReturnType<typeof database>):Promise<Documents> {
  const result = await client.query<{domain:Domain;payload:unknown;revision:number}>(
    "SELECT domain,payload,revision FROM workspace_documents WHERE user_id=$1",[userId]);
  return Object.fromEntries(result.rows.map(row=>[row.domain,{value:row.payload,revision:row.revision}]));
}

export const readDocuments = (userId:string)=>documentsFor(userId,database());
type Guard = (documents:Documents,changes:[Domain,unknown][])=>string;
export class DocumentConstraint extends Error {}

async function guardChanges(client:PoolClient,userId:string,changes:[Domain,unknown][],guard:Guard) {
  if (!changes.some(([domain])=>domain==="records" || domain==="settlements" || domain==="baseball" || domain==="finance" || domain==="subscriptions" || domain==="utilities")) return;
  const error = guard(await documentsFor(userId,client),changes);
  if (error) throw new DocumentConstraint(error);
}

export async function writeDocument(userId:string,domain:Domain,revision:number,value:unknown,guard:Guard):Promise<Revisioned|null> {
  return transaction(async client=>{
    // The same owner lock serializes first-time imports and document writes.
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
    await guardChanges(client,userId,[[domain,value]],guard);
    const result = revision===0
      ? await client.query<Revisioned>(
        "INSERT INTO workspace_documents (user_id,domain,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING payload AS value,revision",
        [userId,domain,JSON.stringify(value)])
      : await client.query<Revisioned>(
        "UPDATE workspace_documents SET payload=$3::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1 AND domain=$2 AND revision=$4 RETURNING payload AS value,revision",
        [userId,domain,JSON.stringify(value),revision]);
    return result.rows[0] ?? null;
  });
}

export async function importDocuments(userId:string,entries:[Domain,unknown][],guard:Guard):Promise<Documents|null> {
  return transaction(async client=>{
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
    const existing = await client.query("SELECT 1 FROM workspace_documents WHERE user_id=$1 AND domain=ANY($2::text[])",[userId,entries.map(([domain])=>domain)]);
    if (existing.rowCount || (entries.some(([domain])=>domain==="chat") && await hasChat(client,userId))) return null;
    await guardChanges(client,userId,entries,guard);
    const claim = await client.query("INSERT INTO workspace_imports(user_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING user_id",[userId]);
    if (!claim.rowCount) return null;
    const result:Documents = {};
    for (const [domain,value] of entries) {
      if (domain==="chat") {
        result.chat = {value:await importChat(client,userId,value as ChatSession[]),revision:0};
        continue;
      }
      await client.query("INSERT INTO workspace_documents(user_id,domain,payload) VALUES($1,$2,$3::jsonb)",[userId,domain,JSON.stringify(value)]);
      result[domain] = {value,revision:1};
    }
    return result;
  });
}
