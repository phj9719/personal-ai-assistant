import Papa from "papaparse";
import {cancelled,gameKey,newGame,outcome,results,teamName,timePattern,types,validateGame,visits,type Game} from "./model.ts";
import {validDate} from "../utilities/model.ts";

const headers = ["일시","경기","스코어","결과","장소","티켓값","비고","배포물","시즌","야구장","좌석","관람 여부","직관 예정","동행인","경기 구분","더블헤더","경기 상태"];
const cellName=(value:string)=>value.trim().replace(/\s+/g,"").replace(/^\uFEFF/,"");
function dateTime(raw:string) {
  const text=raw.trim().replace(/\s*([./-])\s*/g,"$1");
  const match=/^(\d{4}|\d{2})[./-](\d{1,2})[./-](\d{1,2})\.?/.exec(text);
  if (!match) return null;
  const date=[match[1].length===2 ? "20"+match[1] : match[1],match[2].padStart(2,"0"),match[3].padStart(2,"0")].join("-");
  const found=/\b(\d{1,2}):(\d{2})\b/.exec(text.slice(match[0].length));
  const time=found ? found[1].padStart(2,"0")+":"+found[2] : "";
  return validDate(date) && (!time || timePattern.test(time)) ? {date,time} : null;
}

const enumKey = <T extends Record<string,string>>(labels:T,text:string)=>
  Object.entries(labels).find(([key,label])=>key===text || label===text)?.[0] as keyof T|undefined;

export type Preview = {line:number;game:Game|null;error:string;warning:string};
export function importGames(source:string,existing:Game[],team:string,nextId:()=>string):Preview[] {
  if (!source.trim() || source.length>800000) throw new Error("가져올 표는 비어 있지 않아야 하며 최대 800KB입니다.");
  const text=source.trimStart();
  const lines=text.split(/\r?\n/);
  let grid:string[][];
  if (text.startsWith("|") || lines[1]?.includes("---|")) {
    grid=lines.filter(line=>line.trim()).map(line=>line.trim().replace(/^\||\|$/g,"").split(/(?<!\\)\|/).map(cell=>cell.replaceAll("\\|","|").trim()))
      .filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));
  } else {
    const parsed=Papa.parse<string[]>(text,{delimiter:lines[0].includes("\t") ? "\t" : ",",skipEmptyLines:"greedy"});
    if (parsed.errors.length) throw new Error("CSV 구분자와 따옴표를 확인해 주세요.");
    grid=parsed.data;
  }
  const header=grid.shift()?.map(cellName) ?? [];
  const known=new Map(headers.map(label=>[label,header.indexOf(cellName(label))]));
  if ((known.get("일시") ?? -1)<0 || (known.get("경기") ?? -1)<0) throw new Error("표 첫 행에 일시와 경기 머리글이 필요합니다.");
  if (grid.length>2000) throw new Error("한 번에 최대 2,000행까지 가져올 수 있습니다.");
  const keys=new Set(existing.map(gameKey));
  return grid.flatMap((row,index):Preview[]=>{
    const get=(label:string)=>(row[known.get(label) ?? -1] ?? "").trim().replace(/^'(?=[=+\-@\t\r])/,"");
    const originalDate=get("일시"), matchup=get("경기");
    if (!originalDate && !matchup) return [];
    const invalid=(error:string)=>[{line:index+2,game:null,error,warning:""}];
    const date=dateTime(originalDate);
    const teams=matchup.split(/[:：]/).map(teamName);
    if (!date || teams.length!==2) return invalid("일시와 원정팀:홈팀 형식을 확인해 주세요.");
    const game:Game = {...newGame(nextId(),date.date),...date,away:teams[0],home:teams[1],
      season:get("시즌") || date.date.slice(0,4),location:get("장소"),ballpark:get("야구장") || get("장소"),seat:get("좌석"),
      companions:get("동행인"),type:enumKey(types,get("경기 구분")) ?? "regular",slot:Number(get("더블헤더") || 0),
      planned:/^(true|예|직관 예정|1)$/i.test(get("직관 예정")),note:[get("비고"),get("배포물")].filter(Boolean).join("\n")};
    const rawScore=get("스코어"), original=get("결과"), explicit=enumKey(results,get("경기 상태"));
    const scores=/^(\d+)\s*[:：]\s*(\d+)(?:\s*\(?(?:강우|우천)\s*콜드\)?)?$/.exec(rawScore);
    const status=original+" "+rawScore;
    game.result=explicit ?? (scores && /콜드/.test(status) ? "cold" : /우취|우천/.test(status) ? "rain" : /폭취|폭염/.test(status) ? "heat" :
      /노게임/.test(status) ? "noGame" : /기타.*취소|경기.*취소|^취소/.test(status) ? "cancelled" :
      scores ? "final" : "scheduled");
    if (scores && !cancelled(game) && game.result!=="scheduled") [game.awayScore,game.homeScore] = scores.slice(1).map(Number);
    if (rawScore && (!scores || cancelled(game) || /콜드/.test(rawScore))) game.note=[game.note,"원본 스코어 "+rawScore].filter(Boolean).join("\n");
    if (original && !/^(승|패|무|우취|폭취)$/.test(original) && !enumKey(results,original)) game.note=[game.note,"원본 결과 "+original].filter(Boolean).join("\n");
    game.visit=enumKey(visits,get("관람 여부")) ?? (originalDate && scores && !cancelled(game) ? "yes" : "pending");
    const rawCost=get("티켓값").replace(/[,\s원]/g,"");
    if (rawCost) {
      if (!/^\d+$/.test(rawCost) || Number(rawCost)>999999999) return invalid("티켓값은 0 이상 정수 원화로 입력해 주세요.");
      game.cost=Number(rawCost);
    }
    const issue=validateGame(game);
    if (issue || ![0,1,2].includes(game.slot)) return invalid(issue || "더블헤더는 0·1·2로 구분해 주세요.");
    if (keys.has(gameKey(game))) return invalid("이미 등록된 경기이거나 표에서 날짜·팀·더블헤더가 중복되었습니다.");
    keys.add(gameKey(game));
    const computed=outcome(game,team);
    const warning=/^(승|패|무)$/.test(original) && original!==computed ? "원본 "+original+" / 계산 "+(computed ?? "미집계")+" · 응원팀과 스코어를 확인하세요." : "";
    return [{line:index+2,game,error:"",warning}];
  });
}

export function exportGames(games:Game[],team:string) {
  const rows=games.map(game=>[game.date+(game.time ? " "+game.time : ""),game.away+":"+game.home,
    game.awayScore===null ? "" : game.awayScore+":"+game.homeScore,
    outcome(game,team) ?? (cancelled(game) ? results[game.result] : ""),game.location,game.cost ?? "",game.note,"",
    game.season,game.ballpark,game.seat,visits[game.visit],game.planned ? "직관 예정" : "",game.companions,types[game.type],game.slot,results[game.result]]);
  return "\uFEFF"+Papa.unparse([headers,...rows],{escapeFormulae:true});
}
