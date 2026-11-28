import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { authenticatedUserId, authEnabled, signIn, signOut } from "@/auth";
import { WorkspaceStorage } from "@/components/workspace-data";
import { Workspace } from "@/components/workspace";
import { screens } from "@/features/navigation";
import {validDate} from "@/features/utilities/model";
import { seoulNow } from "@/features/baseball/model";
import { seoulDate } from "@/features/modules";
import { Button } from "@/components/ui/button";

export default async function Screen({params, searchParams}: {params:Promise<{screen:string}>,searchParams:Promise<{error?:string;game?:string;tab?:string;day?:string}>}) {
  const {screen} = await params;
  if (screen === "login") {
    const {error} = await searchParams;
    return <main className="login"><section className="panel">
      <h1>온하루 로그인</h1>
      {authEnabled ? <form action={async (data) => {
        "use server";
        try {
          await signIn("credentials", {email:data.get("email"),password:data.get("password"),redirectTo:"/assistant"});
        } catch (failure) {
          if (failure instanceof AuthError) redirect("/login?error=1");
          throw failure;
        }
      }}>
        <label>이메일<input name="email" type="email" autoComplete="username" required /></label>
        <label>비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert">로그인 정보를 확인해 주세요.</p>}
        <Button type="submit">로그인</Button>
      </form> : <><p>가상 데이터 체험은 계정 없이 사용할 수 있습니다.</p><Button asChild><Link href="/assistant">체험 시작</Link></Button></>}
    </section></main>;
  }
  if (!Object.hasOwn(screens,screen)) notFound();
  if (authEnabled && !(await authenticatedUserId())) redirect("/login");
  const logout = authEnabled ? <form action={async () => {
    "use server";
    await signOut({redirectTo:"/login"});
  }}><Button variant="outline">로그아웃</Button></form> : null;
  const {game,tab,day} = ["baseball","finance","life"].includes(screen) ? await searchParams : {};
  return <WorkspaceStorage remote={authEnabled}><Workspace initialLifeDay={typeof day==="string" && validDate(day) ? day : undefined} initialFinanceTab={tab==="subscriptions" ? 6 : undefined} initialGame={game} initialNow={seoulNow(new Date())} demo={!authEnabled} screen={screen as keyof typeof screens} logout={logout} today={seoulDate()} /></WorkspaceStorage>;
}
