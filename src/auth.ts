import NextAuth, {type DefaultSession} from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { userByEmail } from "@/repositories/users";
import { z } from "zod";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {id:string};
  }
}

const derive = promisify(scrypt);
const credentialsSchema = z.object({email:z.email().max(254),password:z.string().min(8).max(256)});

export const authEnabled = process.env.DEMO_MODE === "false";
let attempts = 0;
let retryAt = 0;

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {signIn:"/login"},
  session: {strategy:"jwt"},
  callbacks: {
    session({session,token}) {
      session.user.id = token.sub ?? "";
      return session;
    },
  },
  providers: [Credentials({
    credentials: {email:{type:"email"},password:{type:"password"}},
    async authorize(raw) {
      if (!authEnabled) return null;
      const input = credentialsSchema.safeParse(raw);
      if (!input.success) return null;
      if (Date.now() >= retryAt) {
        attempts = 0;
        retryAt = Date.now() + 60_000;
      }
      if (++attempts > 10) return null;
      const user = await userByEmail(input.data.email);
      const saved = user?.password_hash;
      const [salt, hash] = saved && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(saved)
        ? saved.split(":") : ["0".repeat(32),"0".repeat(128)];
      const derived = await derive(input.data.password,salt,64) as Buffer;
      const match = timingSafeEqual(derived,Buffer.from(hash,"hex"));
      if (!match || !user || !saved || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(saved)) return null;
      attempts = 0;
      return {id:user.id,email:user.email,name:user.name};
    },
  })],
});

export async function authenticatedUserId() {
  const id = (await auth())?.user.id;
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? parsed.data : undefined;
}
