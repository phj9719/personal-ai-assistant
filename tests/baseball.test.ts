import assert from "node:assert/strict";
import test from "node:test";
import {asRecord,baseballLinks,baseballStats,calendarEvents,consecutive,defaultTeam,gameKey,homeSide,initialBaseball,newGame,outcome,
  remindersDue,seoulNow,ticketCost,upcoming,type Baseball,type Game,type Ticket} from "../src/features/baseball/model.ts";
import {exportGames,importGames} from "../src/features/baseball/import.ts";
import {baseballSchema,baseballGuard} from "../src/services/baseball-validation.ts";
import {financeStatistics} from "../src/features/finance/model.ts";
import {emptyData} from "../src/features/workspace/data.ts";
import type {Entry} from "../src/features/modules.ts";
import type {Split} from "../src/features/settlements/model.ts";

const date="2026-04-12";
const initial={...newGame("match-1",date),away:"가상 구단",home:defaultTeam,time:"14:00",planned:true,note:"가상 배포물 예시"};
const ticket:Ticket={id:"ticket-1",gameId:initial.id,status:"planned",general:"2026-04-08T15:00",early:"2026-04-08T10:00",
  bookedAt:null,vendor:"가상 예매처",url:"https://example.invalid",count:2,section:"101",row:"3",seat:"7–8",price:20000,fee:1000,discount:2000,
  refund:0,own:8000,account:"가상 카드",entryId:null,caseId:null,reminders:[15]};
const stored=(games:Game[],tickets:Ticket[]=[]):Baseball=>({...initialBaseball,games,tickets});

test("preserves notes when converting plans and distinguishes series and doubleheaders",()=>{
  const sequence=consecutive({...initial,date:"2026-04-30"},3,()=>crypto.randomUUID());
  assert.deepEqual(sequence.map(game=>game.date),["2026-04-30","2026-05-01","2026-05-02"]);
  assert.equal(asRecord(initial).note,initial.note);
  assert.equal(asRecord(initial).visit,"yes");
  assert.equal(initial.visit,"pending");
  assert.equal(homeSide(initial,defaultTeam),"홈");
  assert.notEqual(gameKey(initial),gameKey({...initial,slot:2}));
  assert.equal(baseballSchema.safeParse(stored([initial,{...initial,id:"duplicate"}])).success,false);
  assert.ok(baseballSchema.safeParse(stored([initial,{...initial,id:"second",slot:2}])).success);
});

test("counts wins only for attended finalized games including cold games, preserving cancelled visits",()=>{
  const games:Game[]=[
    {...asRecord(initial),result:"cold",awayScore:2,homeScore:4,cost:0},
    {...asRecord(initial),id:"draw",date:"2026-04-13",result:"final",awayScore:3,homeScore:3},
    {...asRecord(initial),id:"loss",date:"2026-04-14",result:"final",awayScore:4,homeScore:2,cost:10000},
    {...asRecord(initial),id:"rain",date:"2026-04-15",result:"rain"},
    {...initial,id:"not-attended",date:"2026-04-16",result:"final",awayScore:1,homeScore:5,visit:"no"},
  ];
  const stats=baseballStats(games,[],defaultTeam,[]);
  assert.deepEqual([stats.visits,stats.wins,stats.draws,stats.losses,stats.rate,stats.rain,stats.average],[4,1,1,1,0.5,1,5000]);
  assert.equal(outcome(games[0],"가상 구단"),"패");
  assert.equal(baseballStats([games[1],games[3]],[],defaultTeam,[]).rate,null);
});

test("keeps booking independent and projects Seoul schedules and reminders without duplicate IDs",()=>{
  const data=stored([initial],[ticket]);
  assert.equal(seoulNow(new Date("2026-04-08T00:47:00Z")),"2026-04-08T09:47");
  assert.deepEqual(remindersDue(data,"2026-04-08T09:47").map(row=>row.kind),["early"]);
  assert.equal(upcoming(data,"2026-04-08T11:00").today.length,2);
  assert.equal(upcoming(data,"2026-04-08T11:00").bookings.length,1);
  const booked={...ticket,status:"booked" as const,bookedAt:"2026-04-08T10:00"};
  assert.equal(remindersDue(stored([initial],[booked]),"2026-04-08T09:47").length,0);
  assert.equal(upcoming(stored([initial],[booked]),"2026-04-08T11:00").unbooked.length,0);
  const projection=calendarEvents(stored([initial],[booked]),true);
  assert.deepEqual(projection.map(row=>row.id),["baseball-game:match-1","baseball-early:ticket-1","baseball-general:ticket-1"]);
  assert.equal(initial.visit,"pending");
});

test("imports legacy TSV, Markdown and CSV with zero vs missing costs and confirmation warnings",()=>{
  let n=0;
  const ids=()=> "g"+ ++n;
  const source="일시\t경기\t스코어\t결과\t장소\t티켓값\t배포물\t비고\t전체통계\n2025. 4. 10 목 18:30\t가상 구단:롯데\t5:2\t승\t가상 구장\t0\t가상 굿즈\t기존 메모\t12\n2026-04-03 금\t롯데:가상 구단\t폭염으로 취소\t폭취\t가상 구장\t\t\t\t9\n\t\t\t\t\t\t\t\t30";
  const preview=importGames(source,[],defaultTeam,ids);
  assert.equal(preview.length,2);
  const [first,second]=preview;
  assert.ok(first.warning);
  assert.equal(first.game?.note,"기존 메모\n가상 굿즈");
  assert.equal(first.game?.cost,0);
  assert.equal(second.game?.cost,null);
  assert.equal(second.game?.visit,"pending");
  assert.equal(second.game?.result,"heat");
  assert.match(second.game!.note,/폭염으로 취소/);
  assert.equal(importGames(source,[first.game!],defaultTeam,ids)[0].game,null);
  const md=importGames("| 일시 | 경기 | 스코어 | 티켓값 |\n| --- | --- | --- | --- |\n| 2026-07-03 | 가상 구단:롯데 | 0:5 강우콜드 | 12,000 원 |",[],defaultTeam,ids)[0];
  assert.deepEqual([md.game?.result,md.game?.homeScore,md.game?.cost],["cold",5,12000]);
  const round=importGames(exportGames([first.game!,second.game!],defaultTeam),[],defaultTeam,ids);
  assert.deepEqual(round.map(row=>row.game?.cost),[0,null]);
  assert.equal(round[1].game?.note,second.game?.note);
});

test("maintains gross and own ticket expenses while preventing ledger and settlement duplicates",()=>{
  const paid={...ticket,status:"booked" as const,bookedAt:"2026-04-08T10:00"};
  assert.equal(ticketCost(paid),19000);
  const independent=financeStatistics("2026-04",[],[],[],emptyData.utilities,[],stored([initial],[paid]));
  assert.deepEqual([independent.consumption,independent.outflow],[8000,19000]);
  const entry:Entry={id:"fixture-ledger",group:"지출",date,amount:19000,title:"가상 티켓",detail:""};
  const linked={...paid,entryId:entry.id,own:null};
  const data=stored([initial],[linked]);
  assert.equal(baseballLinks(data,[entry],[]),"");
  assert.equal(financeStatistics("2026-04",[],[],[entry],emptyData.utilities,[],data).consumption,19000);
  assert.ok(baseballLinks({...data,tickets:[linked,{...linked,id:"duplicate"}]},[entry],[]));
  assert.ok(baseballGuard({baseball:{revision:1,value:data}},[["records",emptyData.records]]));
  const split:Split={id:"fixture-case",kind:"split",title:"가상 티켓 정산",date,note:"",own:8000,receipts:[],debits:[],due:null,
    people:[{id:"friend",name:"가상 동행",share:11000}],
    payments:[{id:"fixture-paid",title:"가상 승인",date,method:"transfer",amount:19000,account:"",entryId:entry.id}]};
  const settled=stored([initial],[{...paid,entryId:null,own:null,caseId:split.id}]);
  assert.equal(baseballLinks(settled,[entry],[split]),"");
  assert.ok(baseballLinks(data,[entry],[split]));
  const both=financeStatistics("2026-04",[],[],[entry],emptyData.utilities,[split],settled);
  assert.deepEqual([both.consumption,both.outflow],[8000,19000]);
});
