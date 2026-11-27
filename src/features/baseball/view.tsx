"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import type {Save} from "@/components/workspace-data";
import type {Entry} from "../modules";
import type {Settlements} from "../settlements/model";
import {BaseballDialog,GameForm,money,newTicket,TicketForm,uuid} from "./forms";
import {BaseballCalendar,BaseballHighlights,BaseballImport,BaseballStatistics,useSeoulNow} from "./panels";
import {actualCost,asRecord,baseballLinks,booking,gameKey,gameName,groupTickets,homeSide,newGame,outcome,results,teamName,ticketCost,ticketOwn,types,visits,
  type Baseball,type Game,type Ticket} from "./model";

const tabs=["야구 대시보드","직관 일정","예매 관리","직관 기록","직관 통계","데이터 가져오기·내보내기"];

export function TeamSetting({team,save}:{team:string;save:(team:string)=>Promise<boolean>}) {
  const [status,setStatus] = useState("");
  return <section className="panel settings"><h2>야구 설정</h2>
    <form key={team} onSubmit={async event=>{
      event.preventDefault();
      const next=teamName(String(new FormData(event.currentTarget).get("team") ?? ""));
      if (next && await save(next)) setStatus("응원팀을 저장했습니다. 홈·원정 및 승패가 다시 계산됩니다.");
    }}><label>기본 응원팀<input name="team" defaultValue={team} minLength={1} maxLength={100} required/></label>
      <div><Button type="submit">응원팀 저장</Button></div>
    </form>
    {status && <p role="status">{status}</p>}
  </section>;
}

function TicketDetails({ticket,settlements,onEdit,onDelete}:{ticket:Ticket;settlements:Settlements;onEdit:()=>void;onDelete:()=>void}) {
  return <li><div>
    <strong>{booking[ticket.status]}{ticket.vendor && " · "+ticket.vendor}</strong>
    <p>선예매 {ticket.early?.replace("T"," ") ?? "미정"} · 일반 예매 {ticket.general?.replace("T"," ") ?? "미정"}</p>
    <p>예매 완료 시각 {ticket.bookedAt?.replace("T"," ") ?? "미정"} · {ticket.count===null ? "매수 미정" : ticket.count+"매"}</p>
    {(ticket.section || ticket.row || ticket.seat) && <p>좌석 {[ticket.section,ticket.row,ticket.seat].filter(Boolean).join(" · ")}</p>}
    <p>결제 순액 {money(ticketCost(ticket))} · 본인 부담 {money(ticketOwn(ticket,settlements))}{ticket.account && " · "+ticket.account}</p>
    {ticket.url && <p><a className="baseball-link" href={ticket.url} target="_blank" rel="noreferrer">예매 사이트 열기</a></p>}
  </div><div className="row-actions"><Button variant="outline" onClick={onEdit}>예매 수정</Button><Button variant="ghost" onClick={onDelete}>예매 삭제</Button></div></li>;
}

export function BaseballView({data,save,ledger,settlements,accounts,initialNow,theme,initialSelected}:{
  data:Baseball;save:Save<Baseball>;ledger:Entry[];settlements:Settlements;accounts:string[];initialNow:string;theme:"light"|"dark";initialSelected?:string;
}) {
  const now=useSeoulNow(initialNow);
  const today=now.slice(0,10);
  const [tab,setTab] = useState(0);
  const [selected,select] = useState(initialSelected);
  const [year,setYear] = useState("");
  const [club,setClub] = useState("");
  const [bookingStatus,setBooking] = useState("");
  const [bookingDate,setBookingDate] = useState("");
  const [gameEditor,editGame] = useState<{game:Game;record:boolean}|null>(null);
  const [ticketEditor,editTicket] = useState<Ticket|null>(null);
  const [removal,setRemoval] = useState<{message:string;apply:()=>Promise<boolean>}|null>(null);
  const games=[...data.games].sort((a,b)=>(a.date+a.time+a.slot).localeCompare(b.date+b.time+b.slot));
  const seasons=[...new Set(games.map(game=>game.season))].sort().reverse();
  const clubs=[...new Set(games.flatMap(game=>[game.away,game.home]))].sort((a,b)=>a.localeCompare(b,"ko"));
  const filtered=games.filter(game=>(!year || game.season===year) && (!club || [game.away,game.home].includes(club)));
  const byGame=groupTickets(data.tickets);
  const filteredIds=new Set(filtered.map(game=>game.id));
  const scope={...data,games:filtered,tickets:data.tickets.filter(ticket=>filteredIds.has(ticket.gameId))};
  const detail=games.find(game=>game.id===selected);
  const matches = (ticket:Ticket)=>(!bookingStatus || ticket.status===bookingStatus) &&
    (!bookingDate || ticket.general?.startsWith(bookingDate) || ticket.early?.startsWith(bookingDate));
  const visibleBookings = filtered.filter(game=>{
    const rows=byGame.get(game.id) ?? [];
    return rows.length ? rows.some(matches) : (!bookingStatus || bookingStatus==="unbooked") && !bookingDate && game.planned;
  });

  async function saveGames(next:Game[]) {
    const updating=new Set(next.map(game=>game.id));
    const combined=[...data.games.filter(game=>!updating.has(game.id)),...next];
    if (new Set(combined.map(gameKey)).size!==combined.length) return "날짜·팀·더블헤더가 같은 경기가 있습니다.";
    if (!await save({...data,games:combined})) return "경기를 저장하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.";
    return "";
  }

  async function saveTicket(ticket:Ticket) {
    const next={...data,tickets:[...data.tickets.filter(row=>row.id!==ticket.id),ticket]};
    const issue=baseballLinks(next,ledger,settlements);
    if (issue) return issue;
    if (!await save(next)) return "예매를 저장하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.";
    editTicket(null);
    return "";
  }

  const removeTicket=(row:Ticket)=>setRemoval({
    message:"예매를 삭제할까요? 연결된 가계부·정산 원본은 유지됩니다.",
    apply:()=>save({...data,tickets:data.tickets.filter(ticket=>ticket.id!==row.id)}),
  });
  const gameCards=(items:Game[])=>items.length ? <ul className="rows finance-rows">{items.map(game=><li key={game.id}>
    <div><strong>{gameName(game)}</strong><p>{game.date} {game.time} · {homeSide(game,data.team)} · {types[game.type]} · {game.ballpark || game.location || "장소 미정"}</p>
      <p>{results[game.result]} · {visits[game.visit]}{game.planned ? " · 직관 예정" : ""}{outcome(game,data.team) ? " · "+outcome(game,data.team) : ""}</p></div>
    <Button variant="outline" onClick={()=>select(game.id)}>경기 상세</Button>
  </li>)}</ul> : <p className="empty">표시할 경기가 없습니다.</p>;

  return <>
    <div className="page-title finance-heading"><div><h1>야구</h1><p className="muted">응원팀 {data.team}</p></div>
      {(tab===0 || tab===1 || tab===3) && <Button onClick={()=>editGame({game:tab===3 ? asRecord(newGame(uuid(),today)) : newGame(uuid(),today),record:tab===3})}>
        {tab===3 ? "직관 기록 등록" : "경기 일정 등록"}
      </Button>}
    </div>
    <nav className="finance-tabs" aria-label="야구 메뉴">{tabs.map((title,index)=><button type="button" key={title} aria-pressed={index===tab} onClick={()=>setTab(index)}>{title}</button>)}</nav>
    {tab>0 && tab<5 && <section className="panel utility-filters" aria-label="야구 조회 조건">
      <label>시즌<select aria-label="시즌 필터" value={year} onChange={event=>setYear(event.target.value)}><option value="">전체 시즌</option>{seasons.map(row=><option key={row}>{row}</option>)}</select></label>
      <label>구단<select aria-label="구단 필터" value={club} onChange={event=>setClub(event.target.value)}><option value="">전체 구단</option>{clubs.map(row=><option key={row}>{row}</option>)}</select></label>
      {tab===2 && <>
        <label>예매 상태<select aria-label="예매 상태 필터" value={bookingStatus} onChange={event=>setBooking(event.target.value)}>
          <option value="">전체 상태</option>{Object.entries(booking).map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select></label>
        <label>예매 시작 날짜<input type="date" value={bookingDate} onChange={event=>setBookingDate(event.target.value)}/></label>
        <Button variant="outline" onClick={()=>setBookingDate(today)}>오늘 예매</Button>
      </>}
    </section>}
    {tab===0 && <BaseballHighlights data={data} now={now} onOpen={select}/>}
    {tab===1 && <><BaseballCalendar key={year} data={scope} theme={theme} today={year && year!==today.slice(0,4) ? filtered[0]?.date ?? today : today} onOpen={select}/>
      <section className="panel"><h2>경기 일정</h2>{gameCards(filtered)}</section></>}
    {tab===2 && <>
      <BaseballHighlights data={scope} now={now} onOpen={select}/>
      <section className="panel"><h2>예매 관리</h2>
      {!visibleBookings.length && <p className="muted">조회 조건에 맞는 예매가 없습니다. 경기 상세에서 예매를 등록할 수 있습니다.</p>}
      {visibleBookings.map(game=><section key={game.id} className="baseball-booking">
        <div className="finance-heading"><div><h3>{gameName(game)}</h3><p className="muted">{game.date}</p></div>
          <Button variant="outline" onClick={()=>editTicket(newTicket(game.id))}>예매 추가</Button></div>
        {(byGame.get(game.id) ?? []).length ? <ul className="rows finance-rows">{(byGame.get(game.id) ?? []).filter(matches).map(ticket=>
          <TicketDetails key={ticket.id} ticket={ticket} settlements={settlements} onEdit={()=>editTicket(ticket)} onDelete={()=>removeTicket(ticket)}/>)}</ul> :
          <p className="muted">미예매 · 예매일 미정</p>}
      </section>)}
      </section>
    </>}
    {tab===3 && <section className="panel"><h2>직관 기록</h2>{gameCards(filtered.filter(game=>game.visit!=="pending").reverse())}</section>}
    {tab===4 && <BaseballStatistics data={scope} settlements={settlements}/>}
    {tab===5 && <BaseballImport data={data} onSave={saveGames}/>}
    {detail && !gameEditor && !ticketEditor && !removal && <BaseballDialog title={gameName(detail)} onClose={()=>select(undefined)}>
      <p>{detail.date} {detail.time} · {detail.ballpark || detail.location || "장소 미정"} · {homeSide(detail,data.team)}</p>
      <p>{types[detail.type]} · {results[detail.result]} · {visits[detail.visit]}{detail.planned ? " · 직관 예정" : ""}</p>
      <p>스코어 {detail.awayScore===null ? "미확정" : detail.awayScore+" : "+detail.homeScore} · {outcome(detail,data.team) ?? "승패 미집계"}</p>
      <p>티켓 비용 {money(actualCost(detail,byGame.get(detail.id) ?? [],settlements))} · 좌석 {detail.seat || "미지정"}</p>
      {detail.companions && <p>동행인 {detail.companions}</p>}
      {detail.note && <p className="baseball-note">{detail.note}</p>}
      <div className="row-actions">
        <Button variant="outline" onClick={()=>editGame({game:detail,record:false})}>경기 수정</Button>
        {detail.visit!=="yes" && <Button variant="outline" onClick={()=>editGame({game:asRecord(detail),record:true})}>직관 기록으로 전환</Button>}
        <Button variant="outline" onClick={()=>editTicket(newTicket(detail.id))}>예매 추가</Button>
        <Button variant="ghost" onClick={()=>setRemoval({message:"경기와 연결된 야구 예매를 삭제할까요? 가계부·정산 원본은 남습니다.",apply:async ()=>{
          if (!await save({...data,games:data.games.filter(row=>row.id!==detail.id),tickets:data.tickets.filter(row=>row.gameId!==detail.id)})) return false;
          select(undefined);return true;
        }})}>경기 삭제</Button>
      </div>
      <ul className="rows finance-rows">{(byGame.get(detail.id) ?? []).map(ticket=><TicketDetails key={ticket.id} ticket={ticket} settlements={settlements}
        onEdit={()=>editTicket(ticket)} onDelete={()=>removeTicket(ticket)}/>)}</ul>
      <Button variant="outline" onClick={()=>select(undefined)}>닫기</Button>
    </BaseballDialog>}
    {gameEditor && <GameForm initial={gameEditor.game} existing={data.games.some(row=>row.id===gameEditor.game.id)} team={data.team}
      record={gameEditor.record} onClose={()=>editGame(null)} onSave={async next=>{
        const issue=await saveGames(next);
        if (!issue) {editGame(null);if (next.length===1) select(next[0].id);}
        return issue;
      }}/>}
    {ticketEditor && <TicketForm initial={ticketEditor} games={games} ledger={ledger} settlements={settlements} accounts={accounts}
      now={now} onClose={()=>editTicket(null)} onSave={saveTicket}/>}
    {removal && <BaseballDialog title="삭제 확인" onClose={()=>setRemoval(null)}>
      <p>{removal.message}</p><div className="row-actions"><Button variant="outline" onClick={()=>setRemoval(null)}>닫기</Button>
        <Button onClick={async ()=>{if (await removal.apply()) setRemoval(null);}}>삭제</Button></div>
    </BaseballDialog>}
  </>;
}
