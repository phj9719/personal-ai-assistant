import assert from "node:assert/strict";
import test from "node:test";
import {activitySchema,duration,initialLife,rotationStats,timeline,turn,type Group,type Purchase} from "../src/features/life/model.ts";
import {amounts,dueDates,forecasts,initialSubscriptions,newPayment,occurrence,paidWon,subscriptionEvents,subscriptionsSchema,yearly,type Subscription} from "../src/features/subscriptions/model.ts";
import {subscriptionHistoryError,subscriptionLinks} from "../src/features/subscriptions/links.ts";
import {financeStatistics,initialFinance,createMonth} from "../src/features/finance/model.ts";
import {emptyData} from "../src/features/workspace/data.ts";

const day="2024-02-15";
const group:Group={id:"group",title:"가상 모임",description:"",active:true,members:[],order:["나","가상 동료"],next:"",note:""};
const purchase:Purchase={id:"a",groupId:group.id,date:day,time:null,payer:"나",kind:"self",place:"",detail:"",amount:0,people:[],session:"모임",round:"",note:"",participates:true};
const service:Subscription={id:"0f504ee3-8810-409d-995a-793e7dd9c812",title:"가상 구독",category:"기타",plan:"가상 일반",vendor:"",amount:120000,currency:"KRW",rate:null,unit:"year",interval:1,
  anchor:"2024-02-29",start:null,next:null,end:null,accountId:null,ruleId:null,website:"",manage:"",renew:true,status:"active",trialEnd:null,reminders:[0,1,3,7],note:""};

test("optional activity fields, duration, and real source projections",()=>{
  const activity=activitySchema.parse({id:"67a66bf3-1798-4afd-b342-580d531ad1da",date:day,title:"가상 산책",category:"",start:null,end:null,minutes:null,place:"",people:[],mood:"",tags:[],note:""});
  assert.equal(duration(activity),null);
  assert.equal(duration({...activity,start:"10:10",end:"11:30"}),80);
  const entry={id:"fixture",title:"가상 일정",date:day,amount:0,detail:"",group:"개인"};
  const base={...emptyData.records,schedule:[entry,{...entry,id:"done",completed:true,completedOn:"2024-02-16"}],
    tasks:[{...entry,group:"예정"},{...entry,id:"completed",group:"완료"}]};
  const rows=timeline({...initialLife,activities:[activity]},base,emptyData.baseball);
  assert.deepEqual(rows.map(row=>row.id),["life:67a66bf3-1798-4afd-b342-580d531ad1da","task:completed","schedule:done"]);
  assert.equal(rows.at(-1)?.date,"2024-02-16");
});

test("rotation respects chronological participants and separates zero, unknown and meeting counts",()=>{
  const outside={...purchase,id:"out",payer:"가상 제3자",kind:"other" as const,amount:null};
  const reward={...purchase,id:"reward",payer:"가상 적립 카드",kind:"reward" as const,amount:null};
  const past={...purchase,id:"past",date:"2024-02-14",payer:"가상 동료",kind:"other" as const};
  const rows=[purchase,outside,reward,past];
  assert.equal(turn(group,rows).last?.payer,reward.payer);
  assert.equal(turn(group,rows).participant?.payer,"나");
  assert.equal(turn(group,rows).next,"가상 동료");
  assert.equal(turn(group,rows.filter(row=>row!==purchase)).next,"나");
  assert.equal(turn({...group,order:[],next:""},rows).next,"");
  const stats=rotationStats(rows);
  assert.deepEqual([stats.purchases,stats.meetings,stats.selfAmount,stats.unknown,stats.average,stats.reward],[4,2,0,2,0,1]);
});

test("subscription recurrences keep the original calendar anchor and support overrides",()=>{
  const monthly={...service,unit:"month" as const,anchor:"2024-01-31"};
  assert.deepEqual(dueDates(monthly,"2024-01-01","2024-04-30"),["2024-01-31","2024-02-29","2024-03-31","2024-04-30"]);
  assert.equal(occurrence(service.anchor,"year",1,1),"2025-02-28");
  assert.equal(occurrence(service.anchor,"year",1,4),"2028-02-29");
  assert.equal(occurrence(day,"week",3,1),"2024-03-07");
  assert.equal(occurrence(day,"day",10,1),"2024-02-25");
  assert.deepEqual(dueDates({...monthly,next:"2024-02-02"},"2024-01-01","2024-02-29"),["2024-02-02","2024-02-29"]);
  assert.deepEqual(dueDates({...monthly,next:"2024-01-29"},"2024-01-01","2024-02-29"),["2024-01-29","2024-02-29"]);
  assert.deepEqual(dueDates({...monthly,status:"cancel",end:"2024-02-29"},"2024-03-01","2024-03-31"),[]);
  assert.deepEqual(dueDates({...monthly,status:"trial",trialEnd:"2024-02-20",renew:false},"2024-02-01","2024-02-29"),[]);
});

test("preserves expected plan and exchange snapshots, with separate actual foreign exchange",()=>{
  const original={...service,currency:"USD" as const,amount:12,rate:1000};
  const saved={...newPayment(original,service.anchor,"cd49d6b0-f57d-4df1-9751-936275554929"),state:"paid" as const,amount:12,paidOn:service.anchor,rate:1200,actualCurrency:"USD" as const};
  const data={...initialSubscriptions,services:[{...original,plan:"새 가상 요금제",currency:"EUR" as const,amount:30,rate:1500}],payments:[saved]};
  assert.equal(saved.plan,service.plan);
  assert.equal(subscriptionHistoryError(data,{...data,payments:[{...saved,actualWon:14001}]}),"");
  assert.ok(subscriptionHistoryError(data,{...data,payments:[{...saved,expected:9}]}));
  assert.equal(forecasts(data,"2024-02-01","2024-02-29")[0].amount,12000);
  assert.equal(paidWon(saved),14400);
  assert.equal(paidWon({...saved,rate:null}),null);
  assert.equal(paidWon({...saved,rate:null,actualWon:14001}),14001);
  assert.equal(yearly(service)!/12,10000);
  assert.deepEqual(amounts([null,0,200]),{total:200,unknown:1});
  assert.equal(subscriptionEvents(data,"2024-02-28").some(row=>row.date===service.anchor),false);
  assert.ok(subscriptionsSchema.safeParse(data).success);
  assert.ok(!subscriptionsSchema.safeParse({...data,payments:[saved,{...saved,id:"52802927-44ca-4fd1-a8a6-288763ea318d"}]}).success);
});

test("counts posted subscriptions once and protects fixed and ordinary linked expenses",()=>{
  const finance=initialFinance(day);
  const linked={...service,ruleId:finance.rules[0].id};
  const month=finance.rules[0].start.slice(0,7);
  const row=createMonth(finance.rules,[],month)[0];
  const data={...initialSubscriptions,services:[linked]};
  const planned=financeStatistics(month,[row],[],[],emptyData.utilities,[],emptyData.baseball,data);
  assert.equal(planned.planned.min,120000);
  const offCycle={...row,month:"2024-03"};
  assert.equal(financeStatistics("2024-03",[offCycle],[],[],emptyData.utilities,[],emptyData.baseball,data).planned.min,0);
  const paid={...newPayment(linked,linked.anchor,"pay"),state:"paid" as const,paidOn:linked.anchor,amount:120000,
    actualCurrency:"KRW" as const,posted:true};
  const posted={...data,payments:[paid]};
  assert.equal(financeStatistics(month,[row],[],[],emptyData.utilities,[],emptyData.baseball,posted).consumption,120000);
  const fixed={...finance,monthly:[{...row,paidOn:linked.anchor,paidAmount:120000}]};
  assert.ok(subscriptionLinks(posted,[],fixed,[],emptyData.baseball));
  const matched={...data,payments:[{...paid,posted:false,fixedRuleId:linked.ruleId,fixedMonth:month}]};
  assert.equal(subscriptionLinks(matched,[],fixed,[],emptyData.baseball),"");
  assert.equal(financeStatistics(month,fixed.monthly,[],[],emptyData.utilities,[],emptyData.baseball,matched).consumption,120000);
  const entry={id:"ledger",title:"가상 지출",date:linked.anchor,group:"지출",amount:120000,detail:""};
  const ordinary={...data,payments:[{...paid,posted:false,entryId:entry.id}]};
  assert.equal(subscriptionLinks(ordinary,[entry],finance,[],emptyData.baseball),"");
  assert.ok(subscriptionLinks(ordinary,[],finance,[],emptyData.baseball));
  assert.equal(financeStatistics(month,[],[],[entry],emptyData.utilities,[],emptyData.baseball,ordinary).consumption,120000);
});

test("reads copied TSV, Markdown and CSV while preserving zero and normalizing common Korean date formats",async()=>{
  const {tableDate,tableRows}=await import("../src/features/shared/import.ts");
  assert.deepEqual(tableRows("날짜\t금액\n2024. 2. 29 (목)\t0\n\t"),[{날짜:"2024. 2. 29 (목)",금액:"0"}]);
  assert.equal(tableDate("2024. 2. 29 (목)"),"2024-02-29");
  assert.equal(tableDate("2024/2/9"),"2024-02-09");
  assert.deepEqual(tableRows("| 날짜 | 금액 |\n| --- | --- |\n| 2024-02-02 | |"),[{날짜:"2024-02-02",금액:""}]);
  assert.deepEqual(tableRows('날짜,금액\n2024-02-03,"1,000"'),[{날짜:"2024-02-03",금액:"1,000"}]);
});
