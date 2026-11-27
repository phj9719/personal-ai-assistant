"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RecordsView } from "@/components/records-view";
import type { Records } from "../modules";
import { validMonth, type UtilityState } from "../utilities/model";
import { AccountForm, MonthlyForm, RuleForm, TransferForm } from "./forms";
import {
  createMonth, estimateTotals, expected, financeStatistics, invoice, links,
  methods, modes, outstanding, purposes, type Account, type FinanceState, type Monthly, type Payment, type Rule, type Transfer,
} from "./model";

import {SettlementsView} from "../settlements/view";
import {cashPayments,linkedIds,type Settlements} from "../settlements/model";

const tabs = ["수입·지출 내역","고정 지출 관리","저축 및 투자","결제수단 관리","월별 통계","정산·대납 관리"];
const currency = new Intl.NumberFormat("ko-KR",{maximumFractionDigits:2});
const money = (amount:number|null)=>amount===null ? "미확인" : currency.format(amount)+"원";
const estimate = ({amount,min,max}:ReturnType<typeof expected>)=>amount!==null ? money(amount) :
  min!==null && max!==null ? money(min)+" ~ "+money(max) : "미확인";
const estimateTotal = ({min,max,unknown}:ReturnType<typeof estimateTotals>)=>
  (min===0 && max===0 && unknown ? "" : min===max ? money(min) : money(min)+" ~ "+money(max))+
  (unknown ? (min || max ? " + " : "")+"미확인 "+unknown+"건" : "");

function paymentLabel(payment:Payment,accounts:Account[]) {
  const account = accounts.find(item=>item.id===payment.accountId);
  return methods[payment.method]+(account ? " · "+account.institution+" "+account.name : " · 결제수단 미지정");
}

function replace<T extends {id:string}>(items:T[],next:T) {
  return items.some(item=>item.id===next.id) ? items.map(item=>item.id===next.id ? next : item) : [...items,next];
}

function StatCards({items}:{items:[string,string][]}) {
  return <div className="stats">{items.map(([label,value])=><div className="panel stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function MonthlyList({rows,accounts,utilities,onEdit}:{rows:Monthly[];accounts:Account[];utilities:UtilityState;onEdit:(row:Monthly)=>void}) {
  return <>{rows.length ? <ul className="rows finance-rows">{rows.map(row=><li key={row.ruleId}>
    <div>
      <strong>{row.title}</strong>
      <p>{purposes[row.purpose]} · {row.paidOn ? "납부 완료" : "미납"} · {paymentLabel(row.payment,accounts)}</p>
      <p>예정일 {row.due ? (row.timing==="approximate" ? "약 " : "")+row.due : "미지정"} · 예상 {estimate(expected(row))}</p>
      {row.quote.mode==="daily" && <p>이자 계산 기간 {row.periodStart} ~ {row.periodEnd}</p>}
      {row.utility && <p>{links[row.utility]} 고지액 {money(invoice(row,utilities))}</p>}
      {row.paidOn && <p>실제 납부 {row.paidOn} · {money(row.paidAmount)}</p>}
    </div>
    <Button variant="outline" onClick={()=>onEdit(row)} aria-label={row.title+" 납부 내역 수정"}>납부 내역</Button>
  </li>)}</ul> : <p className="empty">생성된 월별 내역이 없습니다.</p>}</>;
}

function MonthlyStatistics({month,monthly,transfers,records,accounts,utilities,settlements}:{
  month:string;monthly:Monthly[];transfers:Transfer[];records:Records;accounts:Account[];utilities:UtilityState;settlements:Settlements;
}) {
  const stats = financeStatistics(month,monthly,transfers,records.finance,utilities,settlements);
  const linked = linkedIds(settlements);
  const payments = new Map<string,number>();
  function addPayment(payment:Payment|null,amount:number) {
    const name = payment ? paymentLabel(payment,accounts) : "결제수단 미지정 · 일반 거래";
    payments.set(name,((payments.get(name) ?? 0)+Math.round(amount*100)));
  }
  monthly.filter(row=>row.paidOn?.slice(0,7)===month && row.paidAmount!==null).forEach(row=>addPayment(row.payment,row.paidAmount!));
  transfers.filter(row=>row.date.startsWith(month)).forEach(row=>addPayment(row.payment,row.amount));
  records.finance.filter(row=>row.group==="지출" && row.date.startsWith(month) && !linked.has(row.id)).forEach(row=>addPayment(null,row.amount));
  for (const row of cashPayments(settlements,month)) {
    const label = row.account ? "정산·대납 · "+row.account : "정산·대납 · 결제수단 미지정";
    payments.set(label,(payments.get(label) ?? 0)+row.amount*100);
  }
  const dates = new Map<string,ReturnType<typeof expected>[]>();
  for (const row of monthly.filter(row=>row.month===month && row.paidOn===null)) {
    const label = row.due ? row.due+(row.timing==="approximate" ? "경" : "") : "미지정";
    dates.set(label,[...(dates.get(label) ?? []),outstanding(row,utilities)]);
  }

  return <>
    <StatCards items={[
      ["예상 고정 지출",estimateTotal(stats.planned)],["실제 고정 지출 납부액",money(stats.paid)],
      ["남은 납부 예정액",estimateTotal(stats.remaining)],["일반 소비",money(stats.consumption)],
      ["저축",money(stats.savings)],["투자",money(stats.investment)],["전체 자금 유출",money(stats.outflow)],
      ["월 수입",money(stats.income)],["정산·대납 회수금",money(stats.refunds)],["월 수입 대비 남은 자금",money(stats.balance)],
    ]}/>
    <p className="muted finance-stat-note">예정액은 청구월, 실제 지출은 납부일 기준입니다. 남은 자금은 월 수입과 정산·대납 회수금에서 실제 자금 유출을 뺀 금액입니다.</p>
    <div className="finance-breakdown">
      <section className="panel"><h2>결제수단별 실제 유출</h2>
        {payments.size ? <ul className="rows">{[...payments].map(([name,cents])=><li key={name}><span>{name}</span><strong>{money(cents/100)}</strong></li>)}</ul> : <p className="empty">실제 유출 내역이 없습니다.</p>}
      </section>
      <section className="panel"><h2>결제일별 남은 예정액</h2>
        {dates.size ? <ul className="rows">{[...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,amounts])=><li key={date}><span>{date}</span><strong>{estimateTotal(estimateTotals(amounts))}</strong></li>)}</ul> : <p className="empty">남은 예정 내역이 없습니다.</p>}
      </section>
    </div>
  </>;
}

type Editor = {kind:"rule";rule?:Rule} | {kind:"account";account?:Account} | {kind:"transfer";transfer?:Transfer} | {kind:"monthly";row:Monthly};
type Removal = {kind:"rule"|"account"|"transfer";id:string};

export function FinanceView({state,save,records,updateRecords,utilities,today,theme,settlements,saveSettlements}:{
  state:FinanceState;save:(state:FinanceState)=>Promise<boolean>;settlements:Settlements;saveSettlements:(value:Settlements)=>Promise<boolean>;records:Records;updateRecords:(records:Records)=>Promise<boolean>; utilities:UtilityState; today:string; theme:"light"|"dark";
}) {
  const [tab,setTab] = useState(0);
  const [month,setMonth] = useState(today.slice(0,7));
  const [editing,setEditing] = useState<Editor|null>(null);
  const [removing,setRemoving] = useState<Removal|null>(null);
  const [status,setStatus] = useState("");
  const rows = state.monthly.filter(row=>row.month===month);
  const transfers = state.transfers.filter(row=>row.date.startsWith(month));
  const settledSaving = state.monthly.filter(row=>row.purpose!=="consumption" && row.paidOn?.slice(0,7)===month);
  const close = ()=>setEditing(null);

  return <>
    <div className="finance-tabs" role="tablist" aria-label="가계부">
      {tabs.map((title,index)=><button type="button" id={"finance-tab-"+index} role="tab" aria-selected={tab===index}
        aria-controls="finance-panel" tabIndex={tab===index ? 0 : -1} key={title} onClick={()=>{setTab(index);setStatus("");}}
        onKeyDown={event=>{
          const keys:Record<string,number> = {ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1};
          const next = keys[event.key];
          if (next===undefined) return;
          event.preventDefault();
          setTab(next);
          setStatus("");
          document.getElementById("finance-tab-"+next)?.focus();
        }}>{title}</button>)}
    </div>
    <section role="tabpanel" id="finance-panel" aria-labelledby={"finance-tab-"+tab}>
      {tab===0 ? <>
        <RecordsView module="finance" records={records} today={today} theme={theme} onChange={updateRecords} linked={linkedIds(settlements)}/>
        <p className="muted">이 탭에는 원본 거래금액이 표시됩니다. 본인 소비와 실제 자금 유출은 월별 통계에서 확인할 수 있습니다.</p>
      </> : tab===5 ? <SettlementsView cases={settlements} save={saveSettlements} ledger={records.finance}
        accounts={state.accounts.filter(account=>!account.archived).map(account=>account.institution+" · "+account.name)} today={today}/> : <>
        <div className="page-title finance-title">
          <h1>{tabs[tab]}</h1>
          {tab!==3 && <label>조회 월<input aria-label="조회 월" type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>}
        </div>
        {status && <p role="status" className="utility-status">{status}</p>}
        {tab===1 && <>
          <section className="panel">
            <div className="finance-heading"><h2>월별 예정·납부 내역</h2><Button disabled={!validMonth(month)} onClick={async ()=>{
              const monthly = createMonth(state.rules,state.monthly,month);
              const added = monthly.length-state.monthly.length;
              if (added && !await save({...state,monthly})) return;
              setStatus(added ? added+"건의 예정 내역을 생성했습니다." : "새로 생성할 예정 내역이 없습니다.");
            }}>이 달 예정 내역 생성</Button></div>
            <MonthlyList rows={rows} accounts={state.accounts} utilities={utilities} onEdit={row=>setEditing({kind:"monthly",row})}/>
          </section>
          <section className="panel">
            <div className="finance-heading"><h2>반복 지출 설정</h2><Button onClick={()=>setEditing({kind:"rule"})}>고정 지출 등록</Button></div>
            <ul className="rows finance-rows">{state.rules.filter(rule=>!rule.archived).map(rule=><li key={rule.id}>
              <div><strong>{rule.title}</strong><p>{purposes[rule.purpose]} · {modes[rule.quote.mode]} · {rule.active ? "활성" : "비활성"}</p>
                <p>{rule.start} ~ {rule.end ?? "종료일 없음"} · {paymentLabel(rule.payment,state.accounts)}</p>
                {rule.utility && <p>{links[rule.utility]} 연결</p>}</div>
              <div className="row-actions"><Button variant="outline" aria-label={rule.title+" 설정 수정"} onClick={()=>setEditing({kind:"rule",rule})}>수정</Button>
                <Button variant="ghost" aria-label={rule.title+" 설정 삭제"} onClick={()=>setRemoving({kind:"rule",id:rule.id})}>삭제</Button></div>
            </li>)}</ul>
          </section>
        </>}
        {tab===2 && <section className="panel">
          <div className="finance-heading"><h2>저축·투자 이체</h2><Button onClick={()=>setEditing({kind:"transfer"})}>저축·투자 등록</Button></div>
          <p className="muted">고정 지출에서 납부한 저축·투자와 직접 등록한 이체는 전체 자금 유출에 포함됩니다.</p>
          {transfers.length || settledSaving.length ? <ul className="rows finance-rows">
            {settledSaving.map(row=><li key={row.ruleId+row.month}><div><strong>{row.title}</strong><p>{purposes[row.purpose]} · {row.paidOn} · {money(row.paidAmount)} · 고정 지출</p></div>
              <Button variant="outline" onClick={()=>setEditing({kind:"monthly",row})}>납부 내역</Button></li>)}
            {transfers.map(transfer=><li key={transfer.id}><div><strong>{transfer.title}</strong>
              <p>{purposes[transfer.purpose]} · {transfer.date} · {money(transfer.amount)}</p><p>{paymentLabel(transfer.payment,state.accounts)}</p></div>
              <div className="row-actions"><Button variant="outline" aria-label={transfer.title+" 수정"} onClick={()=>setEditing({kind:"transfer",transfer})}>수정</Button>
                <Button variant="ghost" aria-label={transfer.title+" 삭제"} onClick={()=>setRemoving({kind:"transfer",id:transfer.id})}>삭제</Button></div>
            </li>)}
          </ul> : <p className="empty">이 달의 저축·투자 이체가 없습니다.</p>}
        </section>}
        {tab===3 && <section className="panel">
          <div className="finance-heading"><h2>은행 계좌와 카드</h2><Button onClick={()=>setEditing({kind:"account"})}>결제수단 등록</Button></div>
          <ul className="rows finance-rows">{state.accounts.filter(account=>!account.archived).map(account=><li key={account.id}>
            <div><strong>{account.name}</strong><p>{account.kind==="card" ? "카드" : "은행 계좌"} · {account.institution}</p></div>
            <div className="row-actions"><Button variant="outline" aria-label={account.name+" 수정"} onClick={()=>setEditing({kind:"account",account})}>수정</Button>
              <Button variant="ghost" aria-label={account.name+" 보관"} onClick={()=>setRemoving({kind:"account",id:account.id})}>보관</Button></div>
          </li>)}</ul>
        </section>}
        {tab===4 && (validMonth(month) ? <MonthlyStatistics month={month} monthly={state.monthly} transfers={state.transfers} records={records} accounts={state.accounts} utilities={utilities} settlements={settlements}/> :
          <p className="empty">조회 월을 선택해 주세요.</p>)}
      </>}
    </section>
    {editing?.kind==="rule" && <RuleForm rule={editing.rule} rules={state.rules} accounts={state.accounts} today={today} onClose={close} onSave={async rule=>{
      if (await save({...state,rules:replace(state.rules,rule)})) close();
    }}/>}
    {editing?.kind==="account" && <AccountForm account={editing.account} onClose={close} onSave={async account=>{
      if (await save({...state,accounts:replace(state.accounts,account)})) close();
    }}/>}
    {editing?.kind==="transfer" && <TransferForm transfer={editing.transfer} today={today} accounts={state.accounts} onClose={close} onSave={async transfer=>{
      if (await save({...state,transfers:replace(state.transfers,transfer)})) {setMonth(transfer.date.slice(0,7));close();}
    }}/>}
    {editing?.kind==="monthly" && <MonthlyForm row={editing.row} accounts={state.accounts} today={today} onClose={close} onSave={async row=>{
      if (await save({...state,monthly:state.monthly.map(item=>item.ruleId===row.ruleId && item.month===row.month ? row : item)})) close();
    }}/>}
    {removing && <dialog ref={node=>{if (node && !node.open) node.showModal();}} onCancel={()=>setRemoving(null)} className="dialog" aria-labelledby="finance-remove-title">
      <h2 id="finance-remove-title">{removing.kind==="account" ? "결제수단 보관" : "내역 삭제"}</h2>
      <p>{removing.kind==="transfer" ? "선택한 이체 내역을 삭제할까요?" : "이미 생성된 월별 내역과 납부 기록은 보존됩니다."}</p>
      <div className="row-actions"><Button variant="outline" onClick={()=>setRemoving(null)}>취소</Button><Button onClick={async ()=>{
        const next = removing.kind==="rule"
          ? {...state,rules:state.rules.map(item=>item.id===removing.id ? {...item,active:false,archived:true} : item)}
          : removing.kind==="account" ? {...state,accounts:state.accounts.map(item=>item.id===removing.id ? {...item,archived:true} : item)}
          : {...state,transfers:state.transfers.filter(item=>item.id!==removing.id)};
        if (await save(next)) setRemoving(null);
      }}>{removing.kind==="account" ? "보관" : "삭제"}</Button></div>
    </dialog>}
  </>;
}
