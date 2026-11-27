"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AudioLines, Menu, Moon, Sun } from "lucide-react";
import { screens } from "@/features/navigation";
import { sampleRecords, type Records } from "@/features/modules";
import { RecordsView, Summary } from "./records-view";
import { Chat } from "./chat";
import { financeStatistics, initialFinance } from "@/features/finance/model";
import { FinanceView } from "@/features/finance/view";
import { UtilitiesView } from "@/features/utilities/view";
import { comparison, sampleUtilities } from "@/features/utilities/model";
import { Button } from "./ui/button";

import {useLocal} from "./use-local";

type Screen = keyof typeof screens;
const main = ["assistant","dashboard","schedule","tasks"] as const;

export function Workspace({ screen, today, logout }: {screen:Screen; today:string; logout:React.ReactNode}) {
  const [records, save] = useLocal<Records>("onharu-records-v1", sampleRecords(today));
  const [utilities, saveUtilities] = useLocal("onharu-utilities-v1", sampleUtilities(today));
  const [finance, saveFinance] = useLocal("onharu-fixed-finance-v1",initialFinance(today));
  const [theme, setTheme] = useLocal<"light"|"dark">("onharu-theme-v1","light");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const consumption = screen === "dashboard" || screen === "analytics"
    ? financeStatistics(today.slice(0,7),finance.monthly,finance.transfers,records.finance,utilities).consumption : undefined;
  const toggle = () => setTheme(theme === "light" ? "dark" : "light");
  function link(key: Screen) {
    const {icon: Icon,title} = screens[key];
    return <Link key={key} href={`/${key}`} aria-current={screen === key ? "page" : undefined} onClick={() => setExpanded(false)}><Icon size={19} aria-hidden />{title}</Link>;
  }
  return <div className="workspace">
    <aside className={expanded ? "sidebar open" : "sidebar"}>
      <Link className="brand" href="/assistant"><span><AudioLines size={23}/></span><strong>온하루</strong></Link>
      <nav aria-label="전체 메뉴">{(Object.keys(screens) as Screen[]).map(link)}</nav>
      <div className="sidebar-footer"><span className="sample-dot"/> 가상 데이터 모드</div>
    </aside>
    <div className="content">
      <header><span>{screens[screen].title}</span><Button variant="ghost" aria-label={theme === "light" ? "다크 모드" : "라이트 모드"} onClick={toggle}>{theme === "light" ? <Moon size={19}/> : <Sun size={19}/>}</Button></header>
      <main className={screen === "assistant" || screen === "settings" ? "page" : "page page-wide"}>
        {screen === "assistant" ? <Chat/> : screen === "settings" ? <Settings theme={theme} setTheme={setTheme} logout={logout}/> : screen === "dashboard" ? <Summary records={records} today={today} consumption={consumption!} housingCost={comparison(utilities.bills,today.slice(0,7),utilities.residence,false)}/> : screen === "utilities" ? <UtilitiesView state={utilities} save={saveUtilities} today={today} legacy={records.utilities}/> : screen === "finance" ? <FinanceView state={finance} save={saveFinance} records={records} updateRecords={save} utilities={utilities} today={today} theme={theme}/> : <RecordsView key={screen} module={screen} records={records} today={today} theme={theme} consumption={consumption} onChange={save}/>}
      </main>
    </div>
    <nav className="mobile" aria-label="빠른 메뉴">{main.map(link)}<button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Menu size={19}/>전체</button></nav>
  </div>;
}

function Settings({theme,setTheme,logout}:{theme:"light"|"dark";setTheme:(theme:"light"|"dark")=>void;logout:React.ReactNode}) {
  const [memories, save] = useLocal<string[]>("onharu-memories-v1", []);
  return <>
    <h1>설정</h1>
    <section className="panel settings">
      <label>화면 테마<select value={theme} onChange={event=>setTheme(event.target.value === "dark" ? "dark" : "light")}><option value="light">라이트</option><option value="dark">다크</option></select></label>
      <p>시간대 · Asia/Seoul</p>
      <p>AI Provider와 모델은 서버 환경 변수에서 설정합니다.</p>
      {logout}
    </section>
    <section className="panel settings">
      <h2>메모리</h2>
      <p>이 브라우저에 저장됩니다.</p>
      <form onSubmit={event=>{
        event.preventDefault();
        const form = event.currentTarget;
        const value = String(new FormData(form).get("memory")).trim();
        if (value) save([...memories,value]);
        form.reset();
      }}><label>기억할 내용<input name="memory" maxLength={300} required/></label><Button type="submit">저장</Button></form>
      <ul>{memories.map((memory,index)=><li key={index}>{memory} <Button variant="ghost" onClick={()=>save(memories.filter((_,position)=>position !== index))}>삭제</Button></li>)}</ul>
    </section>
  </>;
}
