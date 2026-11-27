"use client";

import {useState,type ReactNode} from "react";
import {Button} from "@/components/ui/button";
import type {Entry} from "../modules";
import {principal,type Settlements} from "../settlements/model";
import {aliases,booking,consecutive,decided,gameName,homeSide,outcome,results,teamName,ticketCost,types,validateGame, validateTicket,visits,
  type Game,type Ticket} from "./model";

export const uuid=()=>crypto.randomUUID();
export const money=(value:number|null)=>value===null ? "미확인" : new Intl.NumberFormat("ko-KR").format(value)+"원";
const get=(data:FormData,key:string)=>String(data.get(key) ?? "").trim();
const optional=(data:FormData,key:string)=>get(data,key) || null;
const number=(data:FormData,key:string)=>get(data,key)==="" ? null : Number(get(data,key));
const options=(values:Record<string,string>)=>Object.entries(values).map(([value,label])=><option value={value} key={value}>{label}</option>);

export function BaseballDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  return <dialog className="dialog settlement-dialog" aria-labelledby="baseball-dialog-title"
    ref={node=>{if (node && !node.open) node.showModal();}} onCancel={onClose}>
    <h2 id="baseball-dialog-title">{title}</h2>{children}
  </dialog>;
}
const actions=(onClose:()=>void)=><div className="row-actions"><Button type="button" variant="outline" onClick={onClose}>취소</Button><Button type="submit">저장</Button></div>;

function Text({name,label,value,required,max=150,list}:{name:string;label:string;value?:string;required?:boolean;max?:number;list?:string}) {
  return <label>{label}<input name={name} defaultValue={value} maxLength={max} required={required} list={list}/></label>;
}

function NumberField({name,label,value,min=0,max=999999999,required}:{name:string;label:string;value:number|null;min?:number;max?:number;required?:boolean}) {
  return <label>{label}<input name={name} type="number" min={min} max={max} step={1} required={required} defaultValue={value ?? ""}/></label>;
}

export function GameForm({initial,team,existing,record,onSave,onClose}:{
  initial:Game;team:string;existing:boolean;record:boolean;onSave:(games:Game[])=>Promise<string>;onClose:()=>void;
}) {
  const [result,setResult] = useState(initial.result);
  const [error,setError] = useState("");
  const hasScore=decided({...initial,result});
  return <BaseballDialog title={record ? "직관 기록" : existing ? "경기 일정 수정" : "경기 일정 등록"} onClose={onClose}>
    <form onSubmit={async event=>{
      event.preventDefault();
      const data=new FormData(event.currentTarget);
      const date=get(data,"date");
      const game:Game={...initial,date,season:get(data,"season") || date.slice(0,4),time:get(data,"time"),
        away:teamName(get(data,"away")),home:teamName(get(data,"home")),ballpark:get(data,"ballpark"),location:get(data,"location"),
        type:get(data,"type") as Game["type"],slot:Number(get(data,"slot")),planned:data.has("planned"),
        visit:get(data,"visit") as Game["visit"],companions:get(data,"companions"),note:get(data,"note"),
        result,awayScore:hasScore ? number(data,"awayScore") : null,homeScore:hasScore ? number(data,"homeScore") : null,
        cost:number(data,"cost"),seat:get(data,"seat")};
      const issue=validateGame(game);
      if (issue) {setError(issue);return;}
      setError(await onSave(consecutive(game,Number(get(data,"series") || 1),uuid)));
    }}>
      <div className="settlement-inline">
        <label>경기 날짜<input name="date" type="date" required defaultValue={initial.date}/></label>
        <label>경기 시작 시간 (서울)<input name="time" type="time" defaultValue={initial.time}/></label>
        <label>시즌<input name="season" type="number" min="1000" max="9999" defaultValue={existing ? initial.season : ""} placeholder="경기 연도 사용"/></label>
        <Text name="away" label="원정팀" value={initial.away} list="baseball-teams" max={100} required/>
        <Text name="home" label="홈팀" value={initial.home} list="baseball-teams" max={100} required/>
        <Text name="location" label="장소" value={initial.location}/>
        <Text name="ballpark" label="야구장" value={initial.ballpark}/>
        <label>경기 구분<select name="type" defaultValue={initial.type}>{options(types)}</select></label>
        <label>더블헤더<select name="slot" defaultValue={initial.slot}><option value="0">일반</option><option value="1">1차전</option><option value="2">2차전</option></select></label>
        {!existing && !record && <label>연속 일정 등록<select name="series"><option value="1">1경기</option><option value="2">2연전</option><option value="3">3연전</option></select></label>}
        <label>경기 상태<select value={result} onChange={event=>setResult(event.target.value as Game["result"])}>{options(results)}</select></label>
        <label>관람 여부<select name="visit" defaultValue={initial.visit}>{options(visits)}</select></label>
        {hasScore && <><NumberField name="awayScore" label="원정 점수" value={initial.awayScore} max={999} required/>
          <NumberField name="homeScore" label="홈 점수" value={initial.homeScore} max={999} required/></>}
        <NumberField name="cost" label="직접 기록한 티켓값 (원)" value={initial.cost}/>
        <Text name="seat" label="좌석 정보" value={initial.seat}/>
        <Text name="companions" label="동행인" value={initial.companions}/>
        <label className="utility-checkbox"><input type="checkbox" name="planned" defaultChecked={initial.planned}/>직관 예정</label>
      </div>
      <datalist id="baseball-teams">{[...new Set([...Object.values(aliases),team])].map(row=><option key={row} value={row}/>)}</datalist>
      {existing && <p className="muted">{homeSide(initial,team)} · 기존 결과 {outcome(initial,team) ?? "미집계"}</p>}
      <label>비고<textarea name="note" defaultValue={initial.note} maxLength={2000} rows={3}/></label>
      {error && <p role="alert">{error}</p>}
      {actions(onClose)}
    </form>
  </BaseballDialog>;
}

export function newTicket(gameId:string):Ticket {
  return {id:uuid(),gameId,status:"planned",general:null,early:null,bookedAt:null,
    vendor:"",url:"",count:null,section:"",row:"",seat:"",price:null,fee:0,discount:0,refund:0,own:null,account:"",entryId:null,caseId:null,reminders:[]};
}

export function TicketForm({initial,games,ledger,settlements,accounts,now,onSave,onClose}:{
  initial:Ticket;games:Game[];ledger:Entry[];settlements:Settlements;accounts:string[];now:string;
  onSave:(ticket:Ticket)=>Promise<string>;onClose:()=>void;
}) {
  const [status,setStatus] = useState(initial.status);
  const [bookedAt,setBookedAt] = useState(initial.bookedAt ?? "");
  const [error,setError] = useState("");
  const setBooking=(next:Ticket["status"])=>{
    setStatus(next);
    if (next==="booked" && !bookedAt) setBookedAt(now);
    if (status==="booked" && next==="unbooked") setBookedAt("");
  };
  return <BaseballDialog title="예매·티켓 내역" onClose={onClose}>
    <form onSubmit={async event=>{
      event.preventDefault();
      const data=new FormData(event.currentTarget);
      const raw=get(data,"reminders");
      const parts=raw ? raw.split(/[,\s]+/).map(Number) : [];
      if (parts.length>12 || parts.some(item=>!Number.isInteger(item) || item<0 || item>10080)) {
        setError("알림은 0~10080분 사이의 정수를 최대 12개 입력해 주세요.");return;
      }
      const ticket:Ticket={...initial,gameId:get(data,"gameId"),status,general:optional(data,"general"),early:optional(data,"early"),bookedAt:bookedAt || null,
        vendor:get(data,"vendor"),url:get(data,"url"),count:number(data,"count"),section:get(data,"section"),row:get(data,"row"),seat:get(data,"seat"),
        price:number(data,"price"),fee:number(data,"fee") ?? 0,discount:number(data,"discount") ?? 0,refund:number(data,"refund") ?? 0,
        own:number(data,"own"),account:get(data,"account"),entryId:optional(data,"entryId"),caseId:optional(data,"caseId"),reminders:[...new Set(parts)]};
      setError(validateTicket(ticket) || await onSave(ticket));
    }}>
      <div className="settlement-inline">
        <label>경기<select name="gameId" defaultValue={initial.gameId} required>{games.map(game=><option key={game.id} value={game.id}>{game.date} · {gameName(game)}</option>)}</select></label>
        <label>예매 상태<select value={status} onChange={event=>setBooking(event.target.value as Ticket["status"])}>{options(booking)}</select></label>
        <label className="utility-checkbox"><input type="checkbox" checked={status==="booked"} onChange={event=>setBooking(event.target.checked ? "booked" : "unbooked")}/>예매 완료</label>
        <label>일반 예매 시작 (서울)<input name="general" type="datetime-local" defaultValue={initial.general ?? ""}/></label>
        <label>선예매 시작 (서울)<input name="early" type="datetime-local" defaultValue={initial.early ?? ""}/></label>
        <label>실제 예매 완료 시각 (서울)<input type="datetime-local" value={bookedAt} required={status==="booked"} onChange={event=>setBookedAt(event.target.value)}/></label>
        <Text name="vendor" label="예매처" value={initial.vendor}/>
        <label>예매 사이트 URL<input name="url" type="url" maxLength={1000} defaultValue={initial.url}/></label>
        <NumberField name="count" label="예매 매수" value={initial.count} min={1} max={999}/>
        <Text name="section" label="좌석 구역" value={initial.section}/>
        <Text name="row" label="좌석 열" value={initial.row}/>
        <Text name="seat" label="좌석 번호" value={initial.seat}/>
        <NumberField name="price" label="전체 티켓 가격 (원)" value={initial.price}/>
        <NumberField name="fee" label="예매 수수료 (원)" value={initial.fee}/>
        <NumberField name="discount" label="할인 (원)" value={initial.discount}/>
        <NumberField name="refund" label="환불 (원)" value={initial.refund}/>
        <NumberField name="own" label="본인 부담금 (원)" value={initial.own}/>
        <Text name="account" label="결제수단" value={initial.account} list="baseball-accounts"/>
        <label>기존 가계부 지출<select name="entryId" defaultValue={initial.entryId ?? ""}><option value="">연결 없음</option>
          {ledger.filter(row=>row.group==="지출").map(row=><option key={row.id} value={row.id}>{row.date} · {row.title} · {money(row.amount)}</option>)}
        </select></label>
        <label>정산·대납 연결<select name="caseId" defaultValue={initial.caseId ?? ""}><option value="">연결 없음</option>
          {settlements.map(row=><option key={row.id} value={row.id}>{row.title} · {money(principal(row))}</option>)}
        </select></label>
        <label>시작 몇 분 전 알림<input name="reminders" placeholder="예: 10, 60" defaultValue={initial.reminders.join(", ")}/></label>
      </div>
      <datalist id="baseball-accounts">{accounts.map(account=><option key={account} value={account}/>)}</datalist>
      <p className="muted">예매일이 미정이면 비워 두세요. 알림은 앱에서만 확인할 수 있습니다.</p>
      {ticketCost(initial)!==null && <p>현재 결제 순액 {money(ticketCost(initial))}</p>}
      {error && <p role="alert">{error}</p>}
      {actions(onClose)}
    </form>
  </BaseballDialog>;
}
