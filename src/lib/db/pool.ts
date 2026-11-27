import { Pool, type PoolClient } from "pg";

let instance:Pool|undefined;

export function database() {
  if (instance) return instance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Database connection is not configured");
  instance = new Pool({connectionString,max:8,connectionTimeoutMillis:3000,idleTimeoutMillis:15000,
    query_timeout:12000});
  instance.on("error",()=>console.error("PostgreSQL idle connection failed"));
  return instance;
}

export async function transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client = await database().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
