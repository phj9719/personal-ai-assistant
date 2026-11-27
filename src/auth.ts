import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const credentialsSchema = z.object({email:z.email().max(254),password:z.string().min(8).max(256)});

export const authEnabled = process.env.DEMO_MODE === "false";
let attempts = 0;
let retryAt = 0;

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {signIn:"/login"},
  session: {strategy:"jwt"},
  providers: [Credentials({
    credentials: {email:{type:"email"},password:{type:"password"}},
    authorize(raw) {
      if (!authEnabled) return null;
      const input = credentialsSchema.safeParse(raw);
      const email = process.env.ADMIN_EMAIL;
      const saved = process.env.ADMIN_PASSWORD_HASH;
      if (!input.success || !email || !saved || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(saved)) return null;
      if (Date.now() >= retryAt) {
        attempts = 0;
        retryAt = Date.now() + 60_000;
      }
      if (++attempts > 10) return null;
      const [salt, hash] = saved.split(":");
      const match = timingSafeEqual(scryptSync(input.data.password, salt, 64), Buffer.from(hash,"hex"));
      if (!match || input.data.email.toLowerCase() !== email.toLowerCase()) return null;
      return {id:"owner",email,name:"관리자"};
    },
  })],
});
