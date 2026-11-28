"use client";

import Link from "next/link";
import {useEffect,useRef,useState,type ComponentRef} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import listPlugin from "@fullcalendar/react/list";
import koLocale from "@fullcalendar/react/locales/ko";
import classicTheme from "@fullcalendar/react/themes/classic";
import {Button} from "@/components/ui/button";
import type {Settlements} from "../settlements/model";
import {calendarEvents,baseballStats,gameName,homeSide,opponent,remindersDue,seoulNow,upcoming,type Baseball,type BaseballEvent,type Game} from "./model";
import {money,uuid} from "./forms";
import {exportGames,importGames,type Preview} from "./import";

export function useSeoulNow(initial:string) {
  const [now,setNow] = useState(initial);
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(seoulNow(new Date())),15000);
    return ()=>window.clearInterval(timer);
  },[]);
  return now;
}

export function BaseballCalendar({data,theme,today,onOpen}:{data:Baseball;theme:"light"|"dark";today:string;onOpen:(id:string)=>void}) {
  const [view,setView] = useState("dayGridMonth");
  const calendar = useRef<ComponentRef<typeof FullCalendar>>(null);
  return <section className="panel schedule-calendar">
    <div className="finance-heading"><h2>야구 캘린더</h2>
      <label>달력 보기<select aria-label="달력 보기" value={view} onChange={event=>{
        setView(event.target.value);
        calendar.current?.getApi().changeView(event.target.value);
      }}><option value="dayGridMonth">월간</option><option value="timeGridWeek">주간</option><option value="listWeek">목록</option></select></label>
    </div>
    <p className="muted">서울 시간 · 경기와 선예매·일반 예매를 색상과 상태로 구분합니다.</p>
    <FullCalendar ref={calendar} plugins={[dayGridPlugin,timeGridPlugin,listPlugin,classicTheme]} initialView="dayGridMonth"
      initialDate={today} locale={koLocale} colorScheme={theme} timeZone="UTC" height="auto" dayMaxEvents={2}
      headerToolbar={{start:"title",center:"",end:"today prev,next"}} toolbarClass="calendar-toolbar"
      events={calendarEvents(data).map(event=>({...event,backgroundColor:event.color,borderColor:event.color,textColor:"#fff"}))}
      eventClick={event=>onOpen(String(event.event.extendedProps.gameId))}/>
  </section>;
}

export function BaseballHighlights({data,now,onOpen}:{data:Baseball;now:string;onOpen?:(id:string)=>void}) {
  const upcomingData=upcoming(data,now);
  const reminders=remindersDue(data,now);
  const link=(id:string,label:string)=>onOpen ? <button className="baseball-link" type="button" onClick={()=>onOpen(id)}>{label}</button>
    : <Link className="baseball-link" href={"/baseball?game="+encodeURIComponent(id)}>{label}</Link>;
  const bookings=(events:BaseballEvent[])=>events.length ? <ul className="rows">{events.slice(0,8).map(event=><li key={event.id}>
    {link(event.gameId,event.title)}<span>{event.start.replace("T"," ")}</span>
  </li>)}</ul> : <p className="muted">표시할 예매 일정이 없습니다.</p>;
  const games=(items:Game[])=>items.length ? <ul className="rows">{items.slice(0,8).map(game=><li key={game.id}>{link(game.id,gameName(game))}<span>{game.date}</span></li>)}</ul>
    : <p className="muted">표시할 경기가 없습니다.</p>;
  return <div className="baseball-panels">
    <section className="panel"><h2>다가오는 직관</h2>{games(upcomingData.games)}</section>
    <section className="panel"><h2>오늘 예매 시작</h2>{bookings(upcomingData.today)}</section>
    <section className="panel"><h2>다가오는 예매</h2>{bookings(upcomingData.bookings)}</section>
    <section className="panel"><h2>미예매 직관 예정 경기</h2>{games(upcomingData.unbooked)}</section>
    {onOpen && <section className="panel"><h2>예매 알림</h2><p className="muted">앱에서만 확인할 수 있습니다.</p>{bookings(reminders)}</section>}
  </div>;
}

const percent=(rate:number|null)=>rate===null ? "미집계" : new Intl.NumberFormat("ko-KR",{style:"percent",maximumFractionDigits:1}).format(rate);

export function BaseballStatistics({data,settlements}:{data:Baseball;settlements:Settlements}) {
  const get=(games:Game[])=>baseballStats(games,data.tickets,data.team,settlements);
  const stats=get(data.games);
  const groups:{name:string;key:(game:Game)=>string}[]=[
    {name:"시즌별",key:game=>game.season},{name:"홈·원정별",key:game=>homeSide(game,data.team)},
    {name:"월별",key:game=>game.date.slice(0,7)},{name:"상대팀별",key:game=>opponent(game,data.team)},
    {name:"야구장별",key:game=>game.ballpark || game.location || "미지정"},
    {name:"요일별",key:game=>new Intl.DateTimeFormat("ko-KR",{weekday:"long",timeZone:"UTC"}).format(new Date(game.date+"T00:00:00Z"))},
  ];
  return <>
    <div className="stats">{[
      ["직관",stats.visits+"회"],["승·무·패",[stats.wins,stats.draws,stats.losses].join(" · ")],["직관 승률",percent(stats.rate)],
      ["최장 연승·연패",stats.winStreak+"승 · "+stats.lossStreak+"패"],["본인 티켓 비용",money(stats.cost)],
      ["경기당 평균 티켓 비용",money(stats.average===null ? null : Math.round(stats.average))],
      ["우천·폭염·노게임·기타 취소",[stats.rain,stats.heat,stats.noGame,stats.other].join(" · ")],
      ["예매 완료·미예매",stats.booked+"경기 · "+stats.unbooked+"경기"],
    ].map(([label,value])=><div className="panel stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="muted">승률은 승 ÷ (승 + 패)입니다. 실제 관람한 결과 확정 경기만 승패에 반영합니다. 평균은 금액을 기록한 방문만 계산합니다.</p>
    <div className="baseball-panels">
      {groups.map(({name,key})=>{
        const grouped=new Map<string,Game[]>();
        for (const game of data.games.filter(game=>game.visit==="yes")) {
          const group=key(game);
          grouped.set(group,[...(grouped.get(group) ?? []),game]);
        }
        return <section className="panel" key={name}><h2>{name} 직관 통계</h2>
          {grouped.size===0 ? <p className="muted">직관 기록이 없습니다.</p> : <ul className="rows">{[...grouped].sort(([a],[b])=>a.localeCompare(b,"ko")).map(([label,games])=>{
            const totals=get(games);
            return <li key={label}><div><strong>{label}</strong><p>{totals.visits}회 · {totals.wins}승 {totals.draws}무 {totals.losses}패 · {percent(totals.rate)}</p></div><strong>{money(totals.cost)}</strong></li>;
          })}</ul>}
        </section>;
      })}
    </div>
  </>;
}

export function BaseballImport({data,onSave}:{data:Baseball;onSave:(games:Game[])=>Promise<string>}) {
  const [input,setInput] = useState("");
  const [preview,setPreview] = useState<Preview[]>([]);
  const [confirmed,setConfirmed] = useState(false);
  const [message,setMessage] = useState("");
  const conflicts=preview.some(row=>row.warning);
  const blocked=!preview.length || preview.some(row=>row.error) || conflicts && !confirmed;
  function change(input:string) {
    setInput(input);setPreview([]);setConfirmed(false);setMessage("");
  }
  return <section className="panel">
    <h2>야구 경기 데이터 가져오기·내보내기</h2>
    <p>Excel 표, Markdown 표, CSV를 사용할 수 있습니다. 표 머리글에는 일시와 경기를 포함하세요.</p>
    <label>CSV 파일<input type="file" accept=".csv,text/csv" onChange={async event=>{
      const file=event.currentTarget.files?.[0];
      event.currentTarget.value="";
      if (!file) return;
      try {
        if (file.size>800000) throw new Error("800KB 이하 파일을 선택해 주세요.");
        change(await file.text());
      } catch (error) {setMessage((error as Error).message);}
    }}/></label>
    <label>경기 표 붙여넣기<textarea value={input} onChange={event=>change(event.target.value)} rows={6} maxLength={800000}/></label>
    <div className="row-actions">
      <Button variant="outline" onClick={()=>{
        try {
          const next=importGames(input,data.games,data.team,uuid);
          setPreview(next);setConfirmed(false);setMessage(next.length ? "" : "가져올 경기 행이 없습니다.");
        } catch (error) {setPreview([]);setMessage((error as Error).message);}
      }}>미리보기</Button>
      <Button variant="outline" onClick={()=>{
        const url=URL.createObjectURL(new Blob([exportGames(data.games,data.team)],{type:"text/csv;charset=utf-8"}));
        const link=document.createElement("a");link.href=url;link.download="onharu-baseball-games.csv";link.click();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      }}>경기 기록 CSV 내보내기</Button>
    </div>
    {preview.length>0 && <ul aria-label="경기 가져오기 미리보기" className="rows baseball-preview">{preview.map(row=><li key={row.line}>
      <div><strong>{row.line}행 {row.game && row.game.date+" · "+gameName(row.game)}</strong><p>{row.error || row.warning || "등록 가능"}</p></div>
    </li>)}</ul>}
    {conflicts && <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>원본과 계산 결과의 차이를 확인했습니다.</label>}
    {preview.length>0 && <Button disabled={blocked} onClick={async ()=>{
      const games=preview.flatMap(row=>row.game ? [row.game] : []);
      const issue=await onSave(games);
      if (issue) {setMessage(issue);return;}
      change("");setMessage(games.length+"경기를 가져왔습니다.");
    }}>등록 적용</Button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
