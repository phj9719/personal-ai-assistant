import pg from "pg";
import { createHash } from "node:crypto";
import { readdir,readFile } from "node:fs/promises";


const {Client} = pg;
const command = process.argv[2];
const adopt = process.argv[3]==="--adopt-legacy";
if (!["migrate","create-owner"].includes(command) || (process.argv[3] && !(command==="migrate" && adopt))) {
  console.error("Usage: node scripts/db.mjs migrate [--adopt-legacy] | create-owner");
  process.exit(1);
}

async function migrate(client) {
  const directory = new URL("../database/migrations/",import.meta.url);
  const names = (await readdir(directory)).filter(name=>/^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async name=>{
    const text = await readFile(new URL(name,directory),"utf8");
    const wrapped = /^\s*BEGIN;([\s\S]*)COMMIT;\s*$/i.exec(text);
    if (!wrapped) throw new Error("Migration must have a BEGIN/COMMIT wrapper");
    return {name,sql:wrapped[1],checksum:createHash("sha256").update(text.replaceAll("\r\n","\n")).digest("hex")};
  }));

  await client.query("SELECT pg_advisory_lock(1641927111)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
    name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const history = await client.query("SELECT name,checksum FROM schema_migrations ORDER BY name");
  for (const row of history.rows) {
    const file = migrations.find(migration=>migration.name===row.name);
    if (!file || file.checksum!==row.checksum) throw new Error("Migration history does not match the repository");
  }
  if (history.rows.some((row,index)=>row.name!==migrations[index]?.name)) throw new Error("Migration history has a gap");
  const baseline = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS exists");
  let count = history.rowCount;
  if (count===0 && baseline.rows[0].exists) {
    if (!adopt) throw new Error("Legacy schema detected. Back up and review it before using --adopt-legacy.");
    const evidence = await client.query(`SELECT
      to_regprocedure('public.set_updated_at()') IS NOT NULL
      AND (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
        AND table_name=ANY($1::text[])) = cardinality($1::text[]) AS core,
      to_regclass('public.utility_bills_housing_month_unique') IS NOT NULL AS housing,
      to_regclass('public.finance_expense_months_utility_once') IS NOT NULL
        AND (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
          AND table_name=ANY($2::text[])) = cardinality($2::text[]) AS finance`,[[
      "users","user_settings","categories","activity_logs","chat_sessions","chat_messages","chat_memories","ai_execution_logs",
      "schedules","projects","tasks","transactions","inventory_items","inventory_history","utility_bills","utility_bill_items",
      "notes","learning_goals","learning_logs","daily_activities",
    ],["finance_payment_accounts","finance_expense_rules","finance_expense_months","finance_transfers"]]);
    const {core,housing,finance} = evidence.rows[0];
    if (!core || (finance && !housing) || migrations[2]?.name!=="003_fixed_expenses.sql") throw new Error("Unrecognized legacy schema");
    const adopted = finance ? 3 : housing ? 2 : 1;
    await client.query("BEGIN");
    try {
      for (const file of migrations.slice(0,adopted)) {
        await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",[file.name,file.checksum]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    count=adopted;
    console.log("Registered existing migrations:",adopted);
  }
  for (const file of migrations.slice(count)) {
    await client.query("BEGIN");
    try {
      await client.query(file.sql);
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",[file.name,file.checksum]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Failed migration:",file.name);
      throw error;
    }
    console.log("Applied:",file.name);
  }
  console.log("Migration history is up to date");
}

async function createOwner(client) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!email || email.length>254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !hash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) {
    throw new Error("Set valid ADMIN_EMAIL and ADMIN_PASSWORD_HASH");
  }
  const result = await client.query(
    "INSERT INTO users(email,name,password_hash) VALUES($1,'관리자',$2) ON CONFLICT (lower(email)) DO NOTHING",[email,hash]);
  console.log(result.rowCount ? "Owner account created" : "Owner account already exists and was preserved");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL");
  process.exit(1);
}
const client = new Client({connectionString,connectionTimeoutMillis:5000});
try {
  await client.connect();
  await (command==="migrate" ? migrate(client) : createOwner(client));
} catch (error) {
  // PostgreSQL diagnostics may include user values. Print only synthetic errors or SQLSTATE.
  if (error.code) console.error("Database command failed:",error.code);
  else if (error instanceof Error && /^(Migration|Legacy|Unrecognized|Set valid)/.test(error.message)) console.error(error.message);
  else console.error("Database command failed");
  process.exitCode=1;
} finally {
  await client.end().catch(()=>{});
}
