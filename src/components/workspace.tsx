"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AudioLines, Menu, Moon, Sun } from "lucide-react";
import { screens } from "@/features/navigation";
import { sampleRecords } from "@/features/modules";
import { RecordsView, Summary } from "./records-view";
import { Chat } from "./chat";
import { accountSuggestions, financeStatistics, initialFinance } from "@/features/finance/model";
import {receivableStats} from "@/features/settlements/model";
import {BaseballView,TeamSetting} from "@/features/baseball/view";
import {BaseballHighlights} from "@/features/baseball/panels";
import {baseballLinks,baseballStats,calendarEvents,initialBaseball} from "@/features/baseball/model";
import {LifeView,lifeColor} from "@/features/life/view";
import {initialLife} from "@/features/life/model";
import {initialSubscriptions,moveDays,subscriptionEvents} from "@/features/subscriptions/model";
import {subscriptionLinks} from "@/features/subscriptions/links";
import { FinanceView } from "@/features/finance/view";
import { UtilitiesView } from "@/features/utilities/view";
import { comparison, sampleUtilities } from "@/features/utilities/model";
import { Button } from "./ui/button";

import {BrowserImport,useWorkspaceData,type Save} from "./workspace-data";

type Screen = keyof typeof screens;
const main = ["assistant","dashboard","schedule","tasks"] as const;

export function Workspace({ screen, today, logout, demo, initialGame, initialNow, initialFinanceTab, initialLifeDay }: {initialFinanceTab?:number;initialLifeDay?:string;screen:Screen; initialGame?:string;initialNow:string;today:string; logout:React.ReactNode; demo:boolean}) {
  const [records, save] = useWorkspaceData("records", sampleRecords(today));
  const [utilities, saveUtilities] = useWorkspaceData("utilities", sampleUtilities(today));
  const [finance, saveFinance] = useWorkspaceData("finance",initialFinance(today));
  const [baseball,saveBaseball] = useWorkspaceData("baseball",initialBaseball);
  const [settlements, saveSettlements] = useWorkspaceData("settlements",[]);
  const [life,saveLife] = useWorkspaceData("life",initialLife);
  const [subscriptions,saveSubscriptions] = useWorkspaceData("subscriptions",initialSubscriptions);
  const [theme, setTheme] = useWorkspaceData("theme","light");
  const [linkError,setLinkError] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const consumption = screen === "dashboard" || screen === "analytics"
    ? financeStatistics(today.slice(0,7),finance.monthly,finance.transfers,records.finance,utilities,settlements,baseball,subscriptions).consumption : undefined;
  const monthlyBaseball = screen==="analytics" ? baseballStats(baseball.games.filter(row=>row.date.startsWith(today.slice(0,7))),baseball.tickets,baseball.team,settlements) : null;
  const events=screen==="schedule" || screen==="dashboard" ? subscriptionEvents(subscriptions,today) : [];
  const noticeEvents=screen==="dashboard" ? events.filter(row=>row.reminders.some(days=>moveDays(row.date,-days)<=today)) : [];
  function guard(issue:string) {
    setLinkError(issue);
    return !issue;
  }
  const toggle = () => setTheme(theme === "light" ? "dark" : "light");
  function link(key: Screen) {
    const {icon: Icon,title} = screens[key];
    return <Link key={key} href={`/${key}`} aria-current={screen === key ? "page" : undefined} onClick={() => setExpanded(false)}><Icon size={19} aria-hidden />{title}</Link>;
  }
  return <div className="workspace">
    <aside className={expanded ? "sidebar open" : "sidebar"}>
      <Link className="brand" href="/assistant"><span><AudioLines size={23}/></span><strong>온하루</strong></Link>
      <nav aria-label="전체 메뉴">{(Object.keys(screens) as Screen[]).map(link)}</nav>
      <div className="sidebar-footer"><span className="sample-dot"/> {demo ? "가상 데이터 모드" : "PostgreSQL 저장"}</div>
    </aside>
    <div className="content">
      <header><span>{screens[screen].title}</span><Button variant="ghost" aria-label={theme === "light" ? "다크 모드" : "라이트 모드"} onClick={toggle}>{theme === "light" ? <Moon size={19}/> : <Sun size={19}/>}</Button></header>
      <main className={screen === "assistant" || screen === "settings" ? "page" : "page page-wide"}>
        {linkError && <p role="alert" className="utility-status">{linkError}</p>}
        {screen === "assistant" ? <Chat/> :
          screen === "settings" ? <><Settings theme={theme} setTheme={setTheme} logout={logout}/>
            <TeamSetting team={baseball.team} save={team=>saveBaseball({...baseball,team})}/></> :
          screen === "dashboard" ? <>
            <Summary demo={demo} receivables={receivableStats(settlements,today.slice(0,7),today)} records={records}
              today={today} consumption={consumption!} housingCost={comparison(utilities.bills,today.slice(0,7),false)}/>
            {noticeEvents.length>0 && <section className="panel"><h2>구독 알림</h2><ul className="rows">{noticeEvents.map(row=><li key={row.id}>
              <Link href="/finance?tab=subscriptions">{row.title}</Link><span>{row.date}</span></li>)}</ul></section>}
            <section><h2>야구 일정</h2><BaseballHighlights data={baseball} now={initialNow}/></section>
          </> :
          screen === "utilities" ? <UtilitiesView state={utilities} save={saveUtilities} today={today} legacy={records.utilities}/> :
          screen === "life" ? <LifeView key={initialLifeDay} initialDay={initialLifeDay} data={life} save={saveLife} records={records} baseball={baseball} today={today} theme={theme}/> :
          screen === "baseball" ? <BaseballView key={initialGame} data={baseball} save={async next=>guard(subscriptionLinks(subscriptions,records.finance,finance,settlements,next)) && await saveBaseball(next)} ledger={records.finance} settlements={settlements}
            accounts={accountSuggestions(finance.accounts)} initialNow={initialNow} theme={theme} initialSelected={initialGame}/> :
          screen === "finance" ? <FinanceView key={initialFinanceTab} initialTab={initialFinanceTab} subscriptions={subscriptions} saveSubscriptions={saveSubscriptions} baseball={baseball} settlements={settlements} saveSettlements={async next=>{
            return guard(baseballLinks(baseball,records.finance,next) || subscriptionLinks(subscriptions,records.finance,finance,next,baseball)) && await saveSettlements(next);
          }} state={finance} save={async (next,deletion)=>guard(subscriptionLinks(subscriptions,records.finance,next,settlements,baseball)) && await saveFinance(next,deletion)}
            records={records} updateRecords={async next=>guard(subscriptionLinks(subscriptions,next.finance,finance,settlements,baseball)) && await save(next)} utilities={utilities} today={today} theme={theme}/> :
          <>
            <RecordsView key={screen} module={screen} records={records} today={today} theme={theme} consumption={consumption} onChange={save}
              baseballEvents={screen==="schedule" ? calendarEvents(baseball,true) : undefined}
              linkedEvents={screen==="schedule" ? [
                ...events.map(row=>({...row,url:"/finance?tab=subscriptions",color:"#7d4694"})),
                ...life.activities.map(row=>({id:"life:"+row.id,date:row.date,title:"일상 · "+row.title,url:"/life?day="+row.date,color:lifeColor(row.category || "일상")})),
              ] : undefined}/>
            {screen==="analytics" && <section className="panel"><h2>이번 달 일상 기록</h2><p>{life.activities.filter(row=>row.date.startsWith(today.slice(0,7))).length}건 · <Link href="/life">일상 활동 통계</Link></p></section>}
            {monthlyBaseball && <section className="panel"><h2>이번 달 야구 관람</h2>
              <p>{monthlyBaseball.visits}회 · 방문 기록의 본인 티켓 비용 {monthlyBaseball.cost.toLocaleString("ko-KR")}원</p>
            </section>}
          </>}
      </main>
    </div>
    <nav className="mobile" aria-label="빠른 메뉴">{main.map(link)}<button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Menu size={19}/>전체</button></nav>
  </div>;
}

function Settings({theme,setTheme,logout}:{theme:"light"|"dark";setTheme:Save<"light"|"dark">;logout:React.ReactNode}) {
  const [memories, save] = useWorkspaceData("memories", []);
  return <>
    <h1>설정</h1>
    <section className="panel settings">
      <label>화면 테마<select value={theme} onChange={event=>setTheme(event.target.value === "dark" ? "dark" : "light")}><option value="light">라이트</option><option value="dark">다크</option></select></label>
      <p>시간대 · Asia/Seoul</p>
      <p>AI Provider와 모델은 서버 환경 변수에서 설정합니다.</p>
      {logout}
    </section>
    <BrowserImport/>
    <section className="panel settings">
      <h2>메모리</h2>
      <form onSubmit={async event=>{
        event.preventDefault();
        const form = event.currentTarget;
        const value = String(new FormData(form).get("memory")).trim();
        if (value && await save([...memories,value])) form.reset();
      }}><label>기억할 내용<input name="memory" maxLength={300} required/></label><Button type="submit">저장</Button></form>
      <ul>{memories.map((memory,index)=><li key={index}>{memory} <Button variant="ghost" onClick={()=>save(memories.filter((_,position)=>position !== index))}>삭제</Button></li>)}</ul>
    </section>
  </>;
}
