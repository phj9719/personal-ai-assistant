"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import type {Save} from "@/components/workspace-data";
import type {Entry} from "../modules";
import type {FinanceState} from "../finance/model";
import type {Settlements} from "../settlements/model";
import type {Baseball} from "../baseball/model";
import {tableDate} from "../shared/import";
import {split} from "../shared/data";
import {Breakdown,Cards,Editor,Input,Select,TableImport,download,field,num,options,wonText} from "../shared/panel";
import {amounts,available,currencies,forecasts,moveDays,newPayment,paidWon,paymentSchema,statuses,
  subscriptionEvents,subscriptionsSchema,subscriptionSchema,units,yearly,type Payment,type Subscription,type Subscriptions} from "./model";
import {subscriptionHistoryError,subscriptionLinks} from "./links";

const tabs=["구독 대시보드","구독 서비스 목록","결제 예정 내역","결제 이력","구독 비용 통계","가져오기·내보내기"];
const payStates={pending:"결제 예정",paid:"결제 완료",skipped:"건너뜀"} as const;
const periods={"month:1":"매월","month:2":"2개월마다","month:3":"분기별","month:6":"반기별","year:1":"매년",custom:"사용자 지정"};
const uuid=()=>crypto.randomUUID();
const replace=<T extends {id:string}>(rows:T[],row:T)=>[...rows.filter(item=>item.id!==row.id),row];
const period=(row:Subscription)=>periods[(row.unit+":"+row.interval) as keyof typeof periods] ?? row.interval+units[row.unit]+"마다";
const formatted=(value:ReturnType<typeof amounts>)=>wonText(value.total)+(value.unknown ? " + 원화 미확정 "+value.unknown+"건" : "");
const base=(today:string):Subscription=>({id:uuid(),title:"",category:"",plan:"",vendor:"",amount:0,currency:"KRW",rate:null,unit:"month",interval:1,
  anchor:today,start:null,next:null,end:null,accountId:null,ruleId:null,website:"",manage:"",renew:true,status:"active",trialEnd:null,reminders:[],note:""});
const native=(amount:number|null,currency:string)=>amount===null ? "미확인" : amount.toLocaleString("ko-KR")+" "+currency;

function totalsBy<T>(rows:T[],label:(row:T)=>string,amount:(row:T)=>number|null) {
  const totals=new Map<string,number>();
  for (const row of rows) {
    const value=amount(row),key=label(row);
    if (value!==null) totals.set(key,(totals.get(key) ?? 0)+value);
  }
  return [...totals].sort(([a],[b])=>b.localeCompare(a));
}
function dateBound(month:string) {
  const [y,m]=month.split("-").map(Number);
  return month+"-"+new Date(Date.UTC(y,m,0)).getUTCDate();
}
function optionsCurrency() {
  return currencies.map(currency=><option key={currency}>{currency}</option>);
}

export function SubscriptionsView({data,save,finance,ledger,settlements,baseball,today}:{
  data:Subscriptions;save:Save<Subscriptions>;finance:FinanceState;ledger:Entry[];settlements:Settlements;baseball:Baseball;today:string;
}) {
  const [tab,setTab]=useState(0),[month,setMonth]=useState(today.slice(0,7)),[showEnded,setEnded]=useState(false);
  const [edit,setEdit]=useState<Subscription|null>(null),[pay,setPay]=useState<Payment|null>(null),[categories,setCategories]=useState(false);
  const [cycle,setCycle]=useState("month:1"),[notice,setNotice]=useState("");
  const current=month || today.slice(0,7);
  const due=forecasts(data,current+"-01",dateBound(current));
  const active=data.services.filter(row=>available(row,today));
  const actual=data.payments.filter(row=>row.state==="paid");
  const inMonth=actual.filter(row=>row.paidOn?.startsWith(current));
  const upcoming=forecasts(data,today,moveDays(today,365)).filter(row=>!row.payment || row.payment.state==="pending");
  const events=subscriptionEvents(data,today);
  const alerts=events.filter(row=>row.reminders.some(days=>moveDays(row.date,-days)<=today));
  const annual=amounts(active.filter(row=>row.status!=="trial" || row.renew).map(yearly));
  const nextYear=amounts(forecasts(data,today,moveDays(today,364)).filter(row=>row.payment?.state!=="skipped").map(row=>row.amount));
  const provisional=due.filter(row=>!row.payment || row.payment.state==="pending");
  const estimate=amounts(due.map(row=>row.amount));
  const nameOf=(id:string)=>data.services.find(row=>row.id===id)?.title ?? "구독";
  const accountOf=(id:string|null)=>finance.accounts.find(row=>row.id===id)?.name ?? "미지정";
  const accountOptions=(ids:(string|null)[]=[])=>finance.accounts.filter(row=>!row.archived || ids.includes(row.id)).map(row=><option value={row.id} key={row.id}>{row.institution} · {row.name}</option>);
  const saveChecked=async(next:Subscriptions)=>{
    const parsed=subscriptionsSchema.safeParse(next);
    if (!parsed.success) return "필수 항목, 날짜·금액 또는 동일 구독의 중복 결제일을 확인해 주세요.";
    const issue=subscriptionHistoryError(data,parsed.data) || subscriptionLinks(parsed.data,ledger,finance,settlements,baseball);
    if (issue) return issue;
    return await save(parsed.data) ? "" : "저장하지 못했습니다.";
  };
  const editService=(row:Subscription)=>{
    setEdit(row);
    const key=row.unit+":"+row.interval;
    setCycle(Object.hasOwn(periods,key) ? key : "custom");
  };
  const changeRows=[...data.changes].sort((a,b)=>b.date.localeCompare(a.date));
  const changed=(row:Subscriptions["changes"][number])=>{
    if (!row.before) return "등록";
    const before=row.before,after=row.after;
    return [
      before.plan!==after.plan && ("요금제 "+(before.plan||"—")+" → "+(after.plan||"—")),
      (before.amount!==after.amount || before.currency!==after.currency) && (native(before.amount,before.currency)+" → "+native(after.amount,after.currency)),
      (before.interval!==after.interval || before.unit!==after.unit || before.anchor!==after.anchor || before.next!==after.next) && ("결제 주기·일정 "+period(before)+" → "+period(after)),
      before.status!==after.status && (statuses[before.status]+" → "+statuses[after.status]),
    ].filter(Boolean).join(" · ") || "기본정보 변경";
  };
  const history=(rows:Payment[],editable=false)=>rows.length ? <ul className="rows finance-rows">{rows.map(row=><li key={row.id}>
    <div><strong>{nameOf(row.serviceId)} · {payStates[row.state]}</strong>
      <p>예정 {row.due} · {native(row.expected,row.currency)} · 요금제 {row.plan || "미지정"}</p>
      {row.paidOn && <p>실제 {row.paidOn} · {native(row.amount,row.actualCurrency ?? row.currency)} · {wonText(paidWon(row))} · {accountOf(row.accountId)}</p>}
      <p>{row.entryId ? "가계부 원본 연결" : row.fixedMonth ? "고정지출 납부 연결" : row.posted ? "가계부 반영" : "구독 기록만 유지"} {row.note}</p>
    </div>{editable && <Button variant="outline" onClick={()=>setPay(row)}>결제 수정</Button>}
  </li>)}</ul> : <p className="empty">표시할 결제가 없습니다.</p>;

  return <>
    <div className="page-title finance-heading"><h1>구독 서비스 관리</h1><div className="row-actions">
      <Button onClick={()=>editService(base(today))}>구독 등록</Button><Button variant="outline" onClick={()=>setCategories(true)}>분류 관리</Button></div></div>
    <nav className="finance-tabs" aria-label="구독 메뉴">{tabs.map((name,index)=><button key={name} aria-pressed={tab===index} onClick={()=>setTab(index)}>{name}</button>)}</nav>
    {(tab===0 || tab===2 || tab===3 || tab===4) && <label>조회 월<input aria-label="구독 조회 월" type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>}
    {tab===0 && <>
      <Cards items={[
        ["활성 구독",active.length+"개"],["무료 체험",active.filter(row=>row.status==="trial" && row.trialEnd!>=today).length+"개"],
        ["해지 예정",active.filter(row=>row.status==="cancel").length+"개"],["조회 월 예상 구독비",formatted(estimate)],
        ["조회 월 실제 구독비",formatted(amounts(inMonth.map(paidWon)))],["조회 월 남은 예정액",formatted(amounts(provisional.map(row=>row.amount)))],
        ["월평균 환산 비용",formatted({total:annual.total/12,unknown:annual.unknown})],["향후 365일 예상 구독비",formatted(nextYear)],
      ]}/>
      <div className="baseball-panels">
        <section className="panel"><h2>다음 결제 예정</h2><ul className="rows">{upcoming.slice(0,8).map(row=><li key={row.id}>
          <span>{row.due} · {row.service.title}</span><strong>{wonText(row.amount)}</strong></li>)}</ul></section>
        <section className="panel"><h2>무료 체험 종료 예정</h2><ul className="rows">{events.filter(row=>row.id.startsWith("subscription-trial:")).slice(0,8).map(row=><li key={row.id}><span>{row.title}</span>{row.date}</li>)}</ul></section>
        <section className="panel"><h2>앱 내 구독 알림</h2>{alerts.length ? <ul className="rows">{alerts.slice(0,12).map(row=><li key={row.id}><span>{row.title}</span>{row.date}</li>)}</ul> : <p className="muted">현재 알림이 없습니다.</p>}</section>
      </div>
      <section className="panel"><h2>최근 결제</h2>{history([...actual].sort((a,b)=>b.paidOn!.localeCompare(a.paidOn!)).slice(0,5))}</section>
      <section className="panel"><h2>최근 금액 변경</h2><ul className="rows">{changeRows.filter(row=>row.before && (row.before.amount!==row.after.amount || row.before.currency!==row.after.currency)).slice(0,8).map(row=><li key={row.id}><span>{row.date} · {row.after.title}</span><span>{changed(row)}</span></li>)}</ul></section>
    </>}
    {tab===1 && <section className="panel"><h2>구독 서비스 목록</h2>
      <label className="utility-checkbox"><input type="checkbox" checked={showEnded} onChange={event=>setEnded(event.target.checked)}/>종료한 구독 포함</label>
      <ul className="rows finance-rows">{data.services.filter(row=>showEnded || row.status!=="ended" && (!row.end || row.end>=today) && (row.status!=="trial" || row.renew || !row.trialEnd || row.trialEnd>=today)).map(row=><li key={row.id}>
        <div><strong>{row.title} · {statuses[row.status]}</strong><p>{[row.category,row.plan,row.vendor,period(row),native(row.amount,row.currency),accountOf(row.accountId)].filter(Boolean).join(" · ")}</p>
          <p>다음 결제 {upcoming.find(item=>item.service.id===row.id)?.due ?? "—"} · 종료 {row.end ?? "미지정"}{row.ruleId ? " · 고정지출 연결" : ""}</p>
          {row.note && <p>{row.note}</p>}
          {row.website && <a className="baseball-link" href={row.website} target="_blank" rel="noreferrer">홈페이지</a>}{" "}
          {row.manage && <a className="baseball-link" href={row.manage} target="_blank" rel="noreferrer">구독 관리·해지</a>}</div>
        <div className="row-actions"><Button variant="outline" onClick={()=>editService(row)} aria-label={row.title+" 수정"}>수정</Button>
          <Button variant="outline" onClick={()=>setPay(newPayment(row,today,uuid()))}>직접 결제 기록</Button></div>
      </li>)}</ul>
    </section>}
    {tab===2 && <section className="panel"><h2>결제 예정 내역</h2>
      <p className="muted">예상 원화는 입력한 환율을 사용합니다. 예정 내역만으로 가계부에 지출을 만들지 않습니다.</p>
      {!due.length && <p className="empty">이 달의 예정 결제가 없습니다.</p>}
      <ul className="rows finance-rows">{due.map(row=><li key={row.id}>
        <div><strong>{row.due} · {row.service.title}</strong><p>{row.payment ? payStates[row.payment.state] : "결제 예정"} · {native(row.payment?.expected ?? row.service.amount,row.payment?.currency ?? row.service.currency)} · {wonText(row.amount)}</p></div>
        <Button variant="outline" onClick={()=>setPay(row.payment ?? newPayment(row.service,row.due,uuid()))}>{row.payment ? "이력 열기" : "결제 기록"}</Button>
      </li>)}</ul>
    </section>}
    {tab===3 && <>
      <section className="panel"><h2>결제 이력</h2>{history(data.payments.filter(row=>row.due.startsWith(current) || row.paidOn?.startsWith(current)).sort((a,b)=>b.due.localeCompare(a.due)),true)}</section>
      <section className="panel"><h2>구독 변경 이력</h2><ul className="rows">{changeRows.map(row=><li key={row.id}><span>{row.date} · {row.after.title}</span><span>{changed(row)}</span></li>)}</ul></section>
    </>}
    {tab===4 && <SubscriptionStats data={data} actual={actual} today={today} month={current} accountOf={accountOf}/>}
    {tab===5 && <>
      <TableImport<Subscription> keyFor={row=>row.title.toLowerCase()+":"+row.anchor} hint="필수 머리글: 서비스명, 구독 금액, 결제 주기, 기준일. 예: 매월, 분기별, 매년 또는 3주. 선택: 분류, 요금제, 제공 업체, 통화, 환율, 메모."
        parse={raw=>{
          const key=Object.entries(periods).find(([,label])=>label===raw["결제 주기"])?.[0];
          const custom=/^(\d+)\s*(일|주|월|개월|연|년)(?:마다)?$/.exec(raw["결제 주기"] ?? "");
          const unit=key?.split(":")[0] ?? (custom ? ({일:"day",주:"week",월:"month",개월:"month",연:"year",년:"year"} as Record<string,string>)[custom[2]] : "");
          const interval=Number(key?.split(":")[1] ?? custom?.[1]);
          const parsed=subscriptionSchema.safeParse({...base(today),title:raw["서비스명"],amount:raw["구독 금액"] ? Number(raw["구독 금액"].replace(/[,\s원]/g,"")) : NaN,
            unit,interval,anchor:tableDate(raw["기준일"] ?? ""),category:raw["분류"] ?? "",plan:raw["요금제"] ?? "",vendor:raw["제공 업체"] ?? "",currency:raw["통화"] || "KRW",
            rate:raw["환율"] ? Number(raw["환율"].replaceAll(",","")) : null,note:raw["메모"] ?? ""});
          if (!parsed.success) return {error:"서비스명·금액·결제 주기·기준일을 확인해 주세요."};
          return data.services.some(row=>row.title.toLowerCase()===parsed.data.title.toLowerCase() && row.anchor===parsed.data.anchor) ? {error:"같은 서비스명과 기준일이 이미 있습니다."} : {row:parsed.data,title:parsed.data.title};
        }} apply={async rows=>{
          const keys=new Set(data.services.map(row=>row.title.toLowerCase()+":"+row.anchor));
          const additions=rows.filter(row=>{const key=row.title.toLowerCase()+":"+row.anchor;if (keys.has(key)) return false;keys.add(key);return true;});
          if (!additions.length) return false;
          return !await saveChecked({...data,services:[...data.services,...additions],changes:[...data.changes,...additions.map(row=>({id:uuid(),serviceId:row.id,date:today,before:null,after:row}))]});
        }}/>
      <Button variant="outline" onClick={()=>download(data,"onharu-subscriptions.json")}>구독·이력 JSON 내보내기</Button>
    </>}
    {edit && <Editor title="구독 설정" close={()=>setEdit(null)} submit={async form=>{
      const [unit,interval]=cycle==="custom" ? [field(form,"unit"),num(form,"interval")] : cycle.split(":");
      const reminders=split(field(form,"reminders")).map(Number);
      const keys=["title","category","plan","vendor","currency","anchor","website","manage","status","note"] as const;
      const optional=["start","next","end","accountId","ruleId","trialEnd"] as const;
      const draft={...edit,...Object.fromEntries(keys.map(key=>[key,field(form,key)])),
        ...Object.fromEntries(optional.map(key=>[key,field(form,key)||null])),amount:num(form,"amount"),rate:num(form,"rate"),
        unit,interval:Number(interval),renew:form.has("renew"),reminders};
      const parsed=subscriptionSchema.safeParse(draft);
      if (!parsed.success) return "필수 항목, 날짜·금액·환율·주소·알림 설정을 확인해 주세요.";
      const before=data.services.find(row=>row.id===edit.id) ?? null;
      if (data.services.some(row=>row.id!==edit.id && row.title.toLowerCase()===parsed.data.title.toLowerCase() && row.anchor===parsed.data.anchor)) return "같은 서비스명과 기준일이 이미 있습니다.";
      const issue=await saveChecked({...data,services:replace(data.services,parsed.data),
        changes:JSON.stringify(before)===JSON.stringify(parsed.data) ? data.changes : [...data.changes,{id:uuid(),serviceId:edit.id,date:today,before,after:parsed.data}]});
      if (!issue) {setEdit(null);setNotice("구독 설정을 저장했습니다.");}
      return issue;
    }}>
      <Input name="title" label="서비스명" value={edit.title} required/><Input name="amount" label="구독 금액" type="number" step={0.01} value={edit.amount} required/>
      <Select name="currency" label="통화" value={edit.currency}>{optionsCurrency()}</Select>
      <Input name="rate" label="예상 원화 환율 (1단위당 원)" type="number" step={0.000001} value={edit.rate}/>
      <label>결제 주기<select value={cycle} onChange={event=>setCycle(event.target.value)}>{options(periods)}</select></label>
      {cycle==="custom" && <><Select name="unit" label="주기 단위" value={edit.unit}>{options(units)}</Select><Input name="interval" label="반복 간격" value={edit.interval} type="number" required/></>}
      <Input name="anchor" label="최초 결제일 또는 기준일" type="date" value={edit.anchor} required/>
      <Input name="next" label="다음 예정일 수동 조정" type="date" value={edit.next}/>
      <Input name="start" label="이용 시작일" type="date" value={edit.start}/><Input name="end" label="종료 예정일" type="date" value={edit.end}/>
      <Select name="status" label="이용 상태" value={edit.status}>{options(statuses)}</Select>
      <Input name="trialEnd" label="무료 체험 종료일" type="date" value={edit.trialEnd}/>
      <Select name="category" label="분류" value={edit.category}><option value="">미분류</option>{[...new Set([...data.categories,edit.category].filter(Boolean))].map(row=><option key={row}>{row}</option>)}</Select>
      <Input name="plan" label="요금제" value={edit.plan}/><Input name="vendor" label="제공 업체" value={edit.vendor}/>
      <Select name="accountId" label="결제수단" value={edit.accountId}><option value="">미지정</option>{accountOptions([edit.accountId])}</Select>
      <Select name="ruleId" label="고정지출 연결" value={edit.ruleId}><option value="">연결 없음</option>{finance.rules.filter(row=>row.purpose==="consumption" && !row.utility && (!row.archived || row.id===edit.ruleId)).map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</Select>
      <Input name="website" label="홈페이지 URL" type="url" value={edit.website}/><Input name="manage" label="구독 관리·해지 URL" type="url" value={edit.manage}/>
      <Input name="reminders" label="알림 (며칠 전, 쉼표 구분)" value={edit.reminders.join(",")}/><Input name="note" label="메모" value={edit.note}/>
      <label className="utility-checkbox"><input type="checkbox" name="renew" defaultChecked={edit.renew}/>자동 갱신</label>
    </Editor>}
    {pay && <Editor title="구독 결제 이력" close={()=>setPay(null)} submit={async form=>{
      const state=field(form,"state");
      const paid=state==="paid";
      const link=field(form,"link");
      const old=data.payments.find(row=>row.id===pay.id);
      const fixedMonth=paid && link==="fixed" ? field(form,"fixedMonth") || null : null;
      const fixedRuleId=fixedMonth ? (fixedMonth===pay.fixedMonth ? pay.fixedRuleId : data.services.find(row=>row.id===pay.serviceId)?.ruleId) ?? null : null;
      const parsed=paymentSchema.safeParse({...pay,due:old?.due ?? field(form,"due"),paidOn:paid ? field(form,"paidOn") : null,state,
        amount:paid ? num(form,"amount") : null,actualWon:paid ? num(form,"actualWon") : null,rate:paid ? num(form,"rate") : null,actualCurrency:paid ? field(form,"actualCurrency") : null,
        accountId:field(form,"accountId") || null,entryId:paid && link==="entry" ? field(form,"entryId") || null : null,
        fixedMonth,fixedRuleId,posted:paid && link==="post" && form.has("confirm"),
        note:field(form,"note")});
      if (!parsed.success || (paid && (link==="post" && !form.has("confirm") || link==="entry" && !field(form,"entryId") || link==="fixed" && !field(form,"fixedMonth")))) {
        return "실제 결제일·금액과 가계부 반영 확인 또는 연결을 확인해 주세요.";
      }
      if (old?.state==="paid" && !paid && !form.has("confirm")) return "납부 상태를 되돌리려면 확인을 선택해 주세요.";
      const issue=await saveChecked({...data,payments:replace(data.payments,parsed.data)});
      if (!issue) {setPay(null);setNotice("결제 이력을 저장했습니다.");}
      return issue;
    }}>
      <p>{nameOf(pay.serviceId)} · 요금제 {pay.plan || "미지정"} · 예상 {native(pay.expected,pay.currency)}</p>
      <Input name="due" label="결제 예정일" type="date" value={pay.due} readOnly={data.payments.some(row=>row.id===pay.id)} required/>
      <Select name="state" label="결제 상태" value={pay.state}>{options(payStates)}</Select>
      <Input name="paidOn" label="실제 결제일" type="date" value={pay.paidOn ?? today}/>
      <Input name="amount" label="실제 결제 금액" type="number" step={0.01} value={pay.amount ?? pay.expected}/>
      <Select name="actualCurrency" label="실제 결제 통화" value={pay.actualCurrency ?? pay.currency}>{optionsCurrency()}</Select>
      <Input name="rate" label="적용 환율" type="number" step={0.000001} value={pay.rate}/>
      <Input name="actualWon" label="실제 원화 결제 금액" type="number" value={pay.actualWon}/>
      <Select name="accountId" label="실제 결제수단" value={pay.accountId}><option value="">미지정</option>{accountOptions([pay.accountId])}</Select>
      <Select name="link" label="가계부 반영" value={pay.entryId ? "entry" : pay.fixedMonth ? "fixed" : pay.posted ? "post" : ""}>
        <option value="">구독 기록만 유지 / 연결 해제</option><option value="entry">기존 가계부 거래 연결</option><option value="fixed">기존 고정지출 납부 연결</option><option value="post">이 결제를 지출로 반영</option>
      </Select>
      <Select name="entryId" label="기존 지출" value={pay.entryId}><option value="">선택</option>{ledger.filter(row=>row.group==="지출").map(row=><option key={row.id} value={row.id}>{row.date} · {row.title} · {wonText(row.amount)}</option>)}</Select>
      <Select name="fixedMonth" label="고정지출 납부 이력" value={pay.fixedMonth}><option value="">선택</option>{finance.monthly.filter(row=>(row.ruleId===data.services.find(item=>item.id===pay.serviceId)?.ruleId || row.ruleId===pay.fixedRuleId && row.month===pay.fixedMonth) && row.paidOn)
        .map(row=><option key={row.month} value={row.month}>{row.month} · {row.paidOn} · {wonText(row.paidAmount)}</option>)}</Select>
      <Input name="note" label="메모" value={pay.note}/>
      <label className="utility-checkbox"><input type="checkbox" name="confirm" defaultChecked={pay.posted}/>지출 반영 또는 기존 완료 상태 변경 확인</label>
    </Editor>}
    {categories && <Editor title="구독 분류 관리" close={()=>setCategories(false)} submit={async form=>{
      const before=field(form,"before"),after=field(form,"after");
      if (!after || after.length>100 || after!==before && data.categories.includes(after)) return "사용 가능한 분류명을 입력해 주세요.";
      const issue=await saveChecked({...data,categories:before ? data.categories.map(row=>row===before ? after : row) : [...data.categories,after],
        services:data.services.map(row=>before && row.category===before ? {...row,category:after} : row)});
      if (!issue) setCategories(false);
      return issue;
    }}>
      <Select name="before" label="변경할 분류"><option value="">새 분류</option>{data.categories.map(row=><option key={row}>{row}</option>)}</Select><Input name="after" label="분류 이름" required/>
    </Editor>}
    {notice && <p role="status">{notice}</p>}
  </>;
}

function SubscriptionStats({data,actual,today,month,accountOf}:{
  data:Subscriptions;actual:Payment[];today:string;month:string;accountOf:(id:string|null)=>string;
}) {
  const year=month.slice(0,4);
  const actualYear=actual.filter(row=>row.paidOn?.startsWith(year));
  const months=Array.from({length:12},(_,index)=>year+"-"+String(index+1).padStart(2,"0"));
  const version=(service:Subscription,date:string)=>{
    const revisions=data.changes.filter(change=>change.serviceId===service.id);
    const latest=revisions.findLast(row=>row.date<=date);
    if (latest) return latest.after;
    if (!revisions.length) return service;
    return service.start && service.start<=date ? (revisions[0].before ?? revisions[0].after) : null;
  };
  const periods=months.map(key=>{
    const last=dateBound(key);
    const services=data.services.flatMap(row=>version(row,last) ?? []);
    const projected=forecasts({...data,services},key+"-01",last);
    return {key,active:services.filter(row=>available(row,last)).length,expected:formatted(amounts(projected.map(row=>row.amount))),
      actual:formatted(amounts(actualYear.filter(row=>row.paidOn?.startsWith(key)).map(paidWon)))};
  });
  const service=(payment:Payment)=>data.services.find(row=>row.id===payment.serviceId);
  const saving=amounts(data.services.filter(row=>row.status==="cancel" && available(row,today)).map(yearly));
  return <>
    <Cards items={[["선택 연도 실제 구독비",formatted(amounts(actualYear.map(paidWon)))],
      ["선택 연도 월평균 실제 비용",wonText(amounts(actualYear.map(paidWon)).total/12)],
      ["해지 예정 연간 환산 절감액",formatted(saving)]]}/>
    <section className="panel"><h2>월별 비용과 활성 구독 변화</h2>
      <p className="muted">예상액은 각 월의 구독 설정 기준이며, 실제액은 결제일로 집계합니다. 연간 실제 평균은 12개월 기준입니다.</p>
      <ul className="rows finance-rows">{periods.map(row=><li key={row.key}><strong>{row.key}</strong><span>예상 {row.expected} · 실제 {row.actual} · 활성 {row.active}개</span></li>)}</ul>
    </section>
    <div className="baseball-panels">
      <Breakdown title="연도별 실제 비용" rows={totalsBy(actual,row=>row.paidOn!.slice(0,4),paidWon)} format={wonText}/>
      <Breakdown title="서비스별 실제 비용" rows={totalsBy(actualYear,row=>service(row)?.title ?? "구독",paidWon)} format={wonText}/>
      <Breakdown title="분류별 실제 비용" rows={totalsBy(actualYear,row=>{
        const target=service(row);return target ? version(target,row.paidOn!)?.category || "미분류" : "미분류";
      },paidWon)} format={wonText}/>
      <Breakdown title="결제수단별 실제 비용" rows={totalsBy(actualYear,row=>accountOf(row.accountId),paidWon)} format={wonText}/>
    </div>
    <section className="panel"><h2>금액 인상·인하 이력</h2><ul className="rows">{data.changes.filter(row=>row.before &&
      (row.before.amount!==row.after.amount || row.before.currency!==row.after.currency)).slice().reverse().map(row=><li key={row.id}>
      <span>{row.date} · {row.after.title}</span><span>{native(row.before!.amount,row.before!.currency)} → {native(row.after.amount,row.after.currency)}</span>
    </li>)}</ul></section>
  </>;
}
