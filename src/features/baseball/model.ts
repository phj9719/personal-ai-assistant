import {validDate} from "../utilities/model.ts";
import type {Entry} from "../modules";
import {linkedIds,type Settlements} from "../settlements/model.ts";

export const defaultTeam = "롯데 자이언츠";
export const types = {exhibition:"시범경기",regular:"정규시즌",post:"포스트시즌",other:"기타"} as const;
export const results = {scheduled:"경기 예정",final:"결과 확정",cold:"강우콜드",rain:"우천 취소",heat:"폭염 취소",noGame:"노게임",cancelled:"기타 경기 취소"} as const;
export const visits = {pending:"미확정",yes:"관람 완료",no:"미관람",cancelled:"관람 취소"} as const;
export const booking = {planned:"예매 예정",unbooked:"미예매",booked:"예매 완료",failed:"예매 실패",cancelled:"예매 취소",unneeded:"예매 불필요"} as const;
export type Game = {
  id:string;season:string;date:string;time:string;away:string;home:string;ballpark:string;location:string;
  type:keyof typeof types;slot:number;planned:boolean;visit:keyof typeof visits;companions:string;note:string;
  result:keyof typeof results;awayScore:number|null;homeScore:number|null;cost:number|null;seat:string;
};
export type Ticket = {
  id:string;gameId:string;status:keyof typeof booking; general:string|null;early:string|null;bookedAt:string|null;
  vendor:string;url:string;count:number|null;section:string;row:string;seat:string;price:number|null;
  fee:number;discount:number;refund:number;own:number|null;account:string;entryId:string|null;caseId:string|null;
  reminders:number[];
};
export type Baseball = {team:string;games:Game[];tickets:Ticket[]};
export const initialBaseball:Baseball = {team:defaultTeam,games:[],tickets:[]};

export const aliases:Record<string,string> = {
  롯데:defaultTeam,두산:"두산 베어스",삼성:"삼성 라이온즈",한화:"한화 이글스",기아:"KIA 타이거즈",kia:"KIA 타이거즈",
  lg:"LG 트윈스",kt:"KT 위즈",nc:"NC 다이노스",ssg:"SSG 랜더스",키움:"키움 히어로즈",
};
export function teamName(name:string) {
  const clean=name.trim().replace(/\s+/g," ");
  return Object.hasOwn(aliases,clean.toLowerCase()) ? aliases[clean.toLowerCase()] : clean;
}
export const homeSide = (game:Game,team:string)=>game.home===team ? "홈" : game.away===team ? "원정" : "중립";
export const opponent = (game:Game,team:string)=>game.home===team ? game.away : game.away===team ? game.home : game.away+" : "+game.home;
export const gameName = (game:Game)=>game.away+" : "+game.home+(game.slot ? " · DH "+game.slot : "");
export const gameKey = (game:Pick<Game,"date"|"away"|"home"|"slot">)=>[game.date,teamName(game.away),teamName(game.home),game.slot].join("|");
export const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function localDateTime(value:string) {
  return value.length===16 && value[10]==="T" && validDate(value.slice(0,10)) && timePattern.test(value.slice(11));
}
export const seoulTimestamp = (value:string)=>Date.parse(value+"+09:00");
export function seoulNow(now:Date) {
  const format=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  return format.format(now).replace(" ","T");
}
export const decided = (game:Game)=>game.result==="final" || game.result==="cold";
export function outcome(game:Game,team:string) {
  if (!decided(game) || game.awayScore===null || game.homeScore===null || homeSide(game,team)==="중립") return null;
  if (game.awayScore===game.homeScore) return "무";
  return (game.home===team)===(game.homeScore>game.awayScore) ? "승" : "패";
}
export const cancelled = (game:Game)=>game.result!=="scheduled" && !decided(game);
export function newGame(id:string,date:string):Game {
  return {id,season:date.slice(0,4),date,time:"",away:"",home:"",location:"",ballpark:"",type:"regular",slot:0,planned:false,visit:"pending",
    companions:"",note:"",result:"scheduled",awayScore:null,homeScore:null,cost:null,seat:""};
}
export function asRecord(game:Game):Game {
  return {...game,visit:"yes"};
}
export function consecutive(game:Game,count:number,nextId:()=>string) {
  return Array.from({length:count},(_,index)=>{
    const day=new Date(Date.parse(game.date+"T00:00:00Z")+index*86400000).toISOString().slice(0,10);
    return {...game,id:index===0 ? game.id : nextId(),date:day};
  });
}

export function ticketCost(ticket:Ticket) {
  return ticket.price===null ? null : ticket.price+ticket.fee-ticket.discount-ticket.refund;
}
export function ticketOwn(ticket:Ticket,settlements:Settlements) {
  if (ticket.caseId) return settlements.find(item=>item.id===ticket.caseId)?.own ?? null;
  return ticket.own ?? ticketCost(ticket);
}
export function validateGame(game:Game) {
  if (!game.away.trim() || !game.home.trim() || teamName(game.away)===teamName(game.home)) return "서로 다른 원정팀과 홈팀을 입력해 주세요.";
  if (!validDate(game.date) || !/^\d{4}$/.test(game.season) || (game.time && !timePattern.test(game.time))) return "시즌·경기일과 경기 시작 시간을 확인해 주세요.";
  if (decided(game) && (game.awayScore===null || game.homeScore===null)) return "확정 경기의 양 팀 점수를 입력해 주세요.";
  if (!decided(game) && (game.awayScore!==null || game.homeScore!==null)) return "결과 확정 경기에서만 점수를 입력할 수 있습니다.";
  return "";
}
export function validateTicket(ticket:Ticket) {
  if ([ticket.general,ticket.early,ticket.bookedAt].some(time=>time!==null && !localDateTime(time))) return "예매 일시를 확인해 주세요.";
  if (ticket.status==="booked" && !ticket.bookedAt) return "예매 완료일과 시간을 입력해 주세요.";
  if (ticket.url) {
    try {
      const url=new URL(ticket.url);
      if (!["https:","http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {return "HTTP 또는 HTTPS 예매 사이트 주소를 입력해 주세요.";}
  }
  const net=ticketCost(ticket);
  if (net!==null && (net<0 || (ticket.own!==null && ticket.own>net))) return "할인·환불과 내 부담금이 전체 티켓 비용을 넘을 수 없습니다.";
  if (ticket.price===null && (ticket.fee || ticket.discount || ticket.refund || ticket.own!==null)) return "수수료나 할인·환불·부담금을 기록하려면 티켓 가격이 필요합니다.";
  if ((ticket.entryId || ticket.caseId) && !ticket.bookedAt) return "가계부·정산 연결은 실제 예매 시각을 기록한 뒤 할 수 있습니다.";
  if (ticket.entryId && ticket.caseId || ticket.caseId && ticket.own!==null) return "가계부 거래와 정산을 동시에 연결할 수 없습니다. 정산에 연결하면 정산의 본인 부담금을 사용합니다.";
  return "";
}

export function baseballLinks(data:Baseball,ledger:Entry[],settlements:Settlements) {
  const ledgerById=new Map(ledger.map(row=>[row.id,row]));
  const caseById=new Map(settlements.map(row=>[row.id,row]));
  const settled=linkedIds(settlements);
  const used=new Set<string>();
  const usedCases=new Set<string>();
  for (const ticket of data.tickets) {
    const net=ticketCost(ticket);
    if (ticket.entryId) {
      const entry=ledgerById.get(ticket.entryId);
      if (used.has(ticket.entryId) || settled.has(ticket.entryId)) return "같은 거래가 다른 티켓이나 정산에 연결되어 있습니다.";
      if (!entry || entry.group!=="지출" || net!==entry.amount || (ticket.own!==null && ticket.own!==net)) {
        return "가계부 연결은 결제 순액과 같은 일반 지출만 가능합니다. 분담금이 있으면 정산에 연결해 주세요.";
      }
      used.add(ticket.entryId);
    }
    if (ticket.caseId) {
      if (usedCases.has(ticket.caseId)) return "같은 정산은 한 예매 내역에만 연결할 수 있습니다.";
      const item=caseById.get(ticket.caseId);
      if (!item || net===null || item.own>net || item.payments.reduce((sum,row)=>sum+row.amount,0)!==net) {
        return "연결 정산의 원금은 티켓 결제 순액과 같아야 합니다.";
      }
      usedCases.add(ticket.caseId);
    }
  }
  return "";
}

export type BaseballEvent = {id:string;gameId:string;title:string;start:string;allDay:boolean;color:string;kind:"game"|"early"|"general"};
const colours={game:"#5267c4",booked:"#277957",unbooked:"#976000",early:"#7d4694",general:"#256480",cancelled:"#8c3e4c",visited:"#356d40"};
export function calendarEvents(data:Baseball,onlyRelevant=false):BaseballEvent[] {
  const tickets=groupTickets(data.tickets);
  return data.games.flatMap(game=>{
    const rows=tickets.get(game.id) ?? [];
    const booked=rows.some(row=>row.status==="booked");
    const missed=game.planned && !booked && (!rows.length || rows.some(row=>!["cancelled","unneeded"].includes(row.status)));
    const state=cancelled(game) ? results[game.result] : game.visit==="cancelled" ? visits.cancelled :
      game.visit==="yes" ? "직관 완료" : booked ? "예매 완료" : missed ? "미예매" : game.planned ? "직관 예정" : "경기";
    const colour=cancelled(game) || game.visit==="cancelled" ? colours.cancelled : game.visit==="yes" ? colours.visited :
      booked ? colours.booked : missed ? colours.unbooked : colours.game;
    const events:BaseballEvent[]=[];
    if (!onlyRelevant || game.planned || game.visit==="yes" || game.visit==="cancelled" || rows.length) {
      events.push({id:"baseball-game:"+game.id,gameId:game.id,title:state+" · "+gameName(game),start:game.date+(game.time ? "T"+game.time : ""),allDay:!game.time,color:colour,kind:"game"});
    }
    for (const ticket of rows) for (const kind of ["early","general"] as const) {
      const start=ticket[kind];
      if (start && (!onlyRelevant || !["cancelled","unneeded"].includes(ticket.status))) {
        events.push({id:"baseball-"+kind+":"+ticket.id,gameId:game.id,title:(kind==="early" ? "선예매" : "일반 예매")+" · "+gameName(game),
          start,allDay:false,color:colours[kind],kind});
      }
    }
    return events;
  });
}
export function groupTickets(tickets:Ticket[]) {
  const map=new Map<string,Ticket[]>();
  for (const row of tickets) {
    const current=map.get(row.gameId);
    if (current) current.push(row);
    else map.set(row.gameId,[row]);
  }
  return map;
}

export function upcoming(data:Baseball,now:string) {
  const active=new Set(data.tickets.filter(row=>["planned","unbooked","failed"].includes(row.status)).map(row=>row.id));
  const games=data.games.filter(game=>game.planned && game.visit==="pending" && !cancelled(game) &&
    (game.date+(game.time ? "T"+game.time : "T23:59"))>=now).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const gameById=new Map(data.games.map(game=>[game.id,game]));
  const upcomingBookings=calendarEvents(data).filter(event=>event.kind!=="game" && active.has(event.id.split(":").at(-1)!) &&
    !cancelled(gameById.get(event.gameId)!) && event.start.slice(0,10)>=now.slice(0,10))
    .sort((a,b)=>a.start.localeCompare(b.start));
  const byGame=groupTickets(data.tickets);
  const unbooked=games.filter(game=>{
    const rows=byGame.get(game.id) ?? [];
    return !rows.some(row=>row.status==="booked" || row.status==="unneeded");
  });
  return {games,bookings:upcomingBookings.filter(event=>event.start>=now),today:upcomingBookings.filter(event=>event.start.startsWith(now.slice(0,10))),unbooked};
}
export function remindersDue(data:Baseball,now:string) {
  const current=seoulTimestamp(now);
  const ticketById=new Map(data.tickets.map(row=>[row.id,row]));
  const gameById=new Map(data.games.map(row=>[row.id,row]));
  return calendarEvents(data).filter(event=>{
    if (event.kind==="game") return false;
    const ticket=ticketById.get(event.id.split(":").at(-1)!);
    const game=gameById.get(event.gameId);
    const start=seoulTimestamp(event.start);
    return ticket && game && !cancelled(game) && ["planned","unbooked","failed"].includes(ticket.status) && current<=start &&
      ticket.reminders.some(minutes=>current>=start-minutes*60000);
  });
}

export function actualCost(game:Game,rows:Ticket[],settlements:Settlements) {
  const values=rows.filter(row=>row.bookedAt || row.status==="booked").map(row=>ticketOwn(row,settlements)).filter(amount=>amount!==null);
  if (!values.length) return game.cost;

  return values.length ? values.reduce((sum,value)=>sum+value,0) : null;
}
export function baseballExpenses(data:Baseball,month:string,settlements:Settlements,ledger:{id?:string}[]) {
  const index=groupTickets(data.tickets);
  const expenses:{amount:number;cash:number;account:string}[]=[];
  const ids=new Set(ledger.map(row=>row.id));
  for (const game of data.games) {
    const rows=index.get(game.id) ?? [];
    if (!rows.some(row=>(row.status==="booked" || row.bookedAt) && ticketOwn(row,settlements)!==null) && game.visit==="yes" && game.date.startsWith(month) && game.cost!==null) expenses.push({amount:game.cost,cash:game.cost,account:"야구 · 이전 기록"});
    for (const row of rows) {
      const date=row.bookedAt ?? (row.status==="booked" ? game.date : "");
      const amount=ticketOwn(row,settlements);
      if (!date.startsWith(month) || amount===null || row.caseId || (row.entryId && ids.has(row.entryId))) continue;
      expenses.push({amount,cash:ticketCost(row) ?? amount,account:"야구 · "+(row.account || "결제수단 미지정")});
    }
  }
  return expenses;
}
export type BaseballSummary = {visits:number;wins:number;draws:number;losses:number;rate:number|null;cost:number;priced:number;average:number|null;rain:number;heat:number;other:number;noGame:number;booked:number;unbooked:number;winStreak:number;lossStreak:number};
export function baseballStats(games:Game[],tickets:Ticket[],team:string,settlements:Settlements):BaseballSummary {
  const rows=groupTickets(tickets);
  let wins=0,draws=0,losses=0,winStreak=0,lossStreak=0,w=0,l=0,cost=0,priced=0;
  const visited=games.filter(game=>game.visit==="yes").sort((a,b)=>(a.date+a.time+a.slot).localeCompare(b.date+b.time+b.slot));
  for (const game of visited) {
    const result=outcome(game,team);
    if (result==="승") {wins++;w++;l=0;winStreak=Math.max(w,winStreak);}
    else if (result==="패") {losses++;l++;w=0;lossStreak=Math.max(l,lossStreak);}
    else if (result==="무") {draws++;w=0;l=0;}
    const amount=actualCost(game,rows.get(game.id) ?? [],settlements);
    if (amount!==null) {cost+=amount;priced++;}
  }
  return {visits:visited.length,wins,draws,losses,rate:wins+losses ? wins/(wins+losses) : null,cost,priced,average:priced ? cost/priced : null,
    rain:games.filter(game=>game.result==="rain").length,heat:games.filter(game=>game.result==="heat").length,
    other:games.filter(game=>game.result==="cancelled").length,noGame:games.filter(game=>game.result==="noGame").length,
    booked:games.filter(game=>rows.get(game.id)?.some(row=>row.status==="booked")).length,
    unbooked:games.filter(game=>game.planned && !cancelled(game) && !(rows.get(game.id) ?? []).some(row=>row.status==="booked" || row.status==="unneeded")).length,
    winStreak,lossStreak};
}
