import {database} from "../lib/db/pool";
export async function userByEmail(email:string) {
  const result = await database().query<{id:string;email:string;name:string;password_hash:string}>(
    "SELECT id,email,name,password_hash FROM users WHERE lower(email)=$1",[email.toLowerCase()]);
  return result.rows[0];
}
