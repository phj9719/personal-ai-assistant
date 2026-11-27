"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { parseNumber, validDate } from "../utilities/model";
import {
  methods, modes, purposes, schedules, links, validateRule, readPeriod,
  type Account, type Rule, type Payment, type Transfer, type Monthly, type Quote,
} from "./model";

function options(labels:Record<string,string>) {
  return Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>);
}

function FormDialog({title,onClose,onSubmit,children}:{title:string;onClose:()=>void;onSubmit:(data:FormData)=>void;children:ReactNode}) {
  const [error,setError] = useState("");
  return <dialog className="dialog utility-dialog" ref={node=>{if (node && !node.open) node.showModal();}} onCancel={onClose} aria-labelledby="finance-dialog-title">
    <form onSubmit={event=>{
      event.preventDefault();
      try { onSubmit(new FormData(event.currentTarget)); }
      catch (failure) { setError((failure as Error).message); }
    }}>
      <h2 id="finance-dialog-title">{title}</h2>
      <div className="finance-fields">{children}</div>
      {error && <p role="alert">{error}</p>}
      <div className="row-actions"><Button variant="outline" type="button" onClick={onClose}>취소</Button><Button type="submit">저장</Button></div>
    </form>
  </dialog>;
}

const field = (data:FormData,key:string)=>String(data.get(key) ?? "").trim();
const currency = (data:FormData,key:string)=>parseNumber(field(data,key),"원");
function paymentFrom(data:FormData,accounts:Account[]):Payment {
  const accountId = field(data,"accountId") || null;
  const method = field(data,"method") as Payment["method"];
  const account = accounts.find(item=>item.id===accountId);
  if (accountId && (!account || (method==="card")!==(account.kind==="card"))) {
    throw new Error("카드결제는 카드, 직접이체·자동출금은 은행 계좌를 선택해 주세요.");
  }
  return {accountId,method};
}

function PaymentFields({payment,accounts}:{payment?:Payment;accounts:Account[]}) {
  const [method,setMethod] = useState<Payment["method"]>(payment?.method ?? "transfer");
  const [id,setId] = useState(payment?.accountId ?? "");
  return <>
    <label>납부 방식<select name="method" value={method} onChange={event=>{setMethod(event.target.value as Payment["method"]);setId("");}}>{options(methods)}</select></label>
    <label>결제수단<select name="accountId" value={id} onChange={event=>setId(event.target.value)}>
      <option value="">미지정</option>
      {accounts.filter(account=>(!account.archived || account.id===id) && (method==="card")===(account.kind==="card")).map(account=>
        <option value={account.id} key={account.id}>{account.institution} · {account.name}{account.archived ? " (보관)" : ""}</option>)}
    </select></label>
  </>;
}

export function RuleForm({rule,rules,accounts,today,onSave,onClose}:{rule?:Rule;rules:Rule[];accounts:Account[];today:string;onSave:(rule:Rule)=>void;onClose:()=>void}) {
  const [mode,setMode] = useState<Quote["mode"]>(rule?.quote.mode ?? "fixed");
  const [timing,setTiming] = useState<Rule["timing"]>(rule?.timing ?? "unspecified");
  return <FormDialog title={rule ? "고정 지출 수정" : "고정 지출 등록"} onClose={onClose} onSubmit={data=>{
    const next:Rule = {
      id:rule?.id ?? crypto.randomUUID(),title:field(data,"title"),purpose:field(data,"purpose") as Rule["purpose"],
      payment:paymentFrom(data,accounts),quote:{mode,amount:currency(data,"amount"),min:mode==="variable" ? currency(data,"min") : null,max:mode==="variable" ? currency(data,"max") : null},
      timing,day:timing==="unspecified" ? null : Number(field(data,"day")),start:field(data,"start"),end:field(data,"end") || null,
      active:data.has("active"),utility:(field(data,"utility") || null) as Rule["utility"],
    };
    const error = validateRule(next,rules);
    if (error) throw new Error(error);
    onSave(next);
  }}>
    <label>지출 이름<input name="title" defaultValue={rule?.title} maxLength={100} required/></label>
    <label>용도<select name="purpose" defaultValue={rule?.purpose}>{options(purposes)}</select></label>
    <label>금액 유형<select name="mode" value={mode} onChange={event=>setMode(event.target.value as Quote["mode"])}>{options(modes)}</select></label>
    <label>{mode==="daily" ? "하루 금액 (원)" : "예상 금액 (원)"}<input key={mode} name="amount" inputMode="decimal" defaultValue={mode===rule?.quote.mode ? rule.quote.amount ?? "" : ""} required={mode!=="variable"}/></label>
    {mode==="variable" && <>
      <label>최소 금액 (원)<input name="min" inputMode="decimal" defaultValue={rule?.quote.min ?? ""}/></label>
      <label>최대 금액 (원)<input name="max" inputMode="decimal" defaultValue={rule?.quote.max ?? ""}/></label>
    </>}
    <label>납부일 유형<select name="timing" value={timing} onChange={event=>setTiming(event.target.value as Rule["timing"])}>{options(schedules)}</select></label>
    {timing!=="unspecified" && <label>매월 납부 예정일 (일)<input type="number" name="day" min={1} max={31} defaultValue={rule?.day ?? ""} required/></label>}
    <label>적용 시작일<input name="start" type="date" defaultValue={rule?.start ?? today} required/></label>
    <label>적용 종료일<input name="end" type="date" defaultValue={rule?.end ?? ""}/></label>
    <PaymentFields accounts={accounts} payment={rule?.payment}/>
    <label>공과금 연결<select name="utility" defaultValue={rule?.utility ?? ""}><option value="">연결 안 함</option>{options(links)}</select></label>
    <label className="utility-checkbox"><input type="checkbox" name="active" defaultChecked={rule?.active ?? true}/>활성화</label>
  </FormDialog>;
}

export function MonthlyForm({row,accounts,today,onSave,onClose}:{row:Monthly;accounts:Account[];today:string;onSave:(row:Monthly)=>void;onClose:()=>void}) {
  const [paid,setPaid] = useState(row.paidOn!==null);
  return <FormDialog title={row.title+" 납부 내역"} onClose={onClose} onSubmit={data=>{
    const paidOn = paid ? field(data,"paidOn") : null;
    const paidAmount = paid ? currency(data,"paidAmount") : null;
    if (paid && (!paidOn || !validDate(paidOn) || paidAmount===null)) throw new Error("실제 납부일과 금액을 입력해 주세요.");
    const periodStart = row.quote.mode==="daily" ? field(data,"periodStart") : row.periodStart;
    const periodEnd = row.quote.mode==="daily" ? field(data,"periodEnd") : row.periodEnd;
    if (row.quote.mode==="daily" && !readPeriod(periodStart,periodEnd)) throw new Error("이자 계산 기간을 확인해 주세요. 시작일과 종료일을 포함해 최대 366일입니다.");
    onSave({...row,periodStart,periodEnd,paidOn,paidAmount,payment:paymentFrom(data,accounts)});
  }}>
    {row.quote.mode==="daily" && <>
      <label>이자 계산 시작일<input name="periodStart" type="date" defaultValue={row.periodStart} required/></label>
      <label>이자 계산 종료일<input name="periodEnd" type="date" defaultValue={row.periodEnd} required/></label>
    </>}
    <PaymentFields accounts={accounts} payment={row.payment}/>
    <label className="utility-checkbox"><input type="checkbox" checked={paid} onChange={event=>setPaid(event.target.checked)}/>납부 완료</label>
    {paid && <>
      <label>실제 납부일<input name="paidOn" type="date" defaultValue={row.paidOn ?? today} required/></label>
      <label>실제 납부 금액 (원)<input name="paidAmount" inputMode="decimal" defaultValue={row.paidAmount ?? ""} required/></label>
    </>}
  </FormDialog>;
}

export function AccountForm({account,onSave,onClose}:{account?:Account;onSave:(account:Account)=>void;onClose:()=>void}) {
  return <FormDialog title={account ? "결제수단 수정" : "결제수단 등록"} onClose={onClose} onSubmit={data=>{
    const name = field(data,"name"), institution = field(data,"institution");
    if (!name || !institution) throw new Error("금융기관과 결제수단 이름을 입력해 주세요.");
    onSave({id:account?.id ?? crypto.randomUUID(),name,institution,kind:field(data,"kind") as Account["kind"]});
  }}>
    <label>유형<select name="kind" defaultValue={account?.kind} disabled={!!account}><option value="bank">은행 계좌</option><option value="card">카드</option></select></label>
    {account && <input type="hidden" name="kind" value={account.kind}/>}
    <label>은행 또는 카드사<input name="institution" defaultValue={account?.institution} maxLength={50} required/></label>
    <label>결제수단 별칭<input name="name" defaultValue={account?.name} maxLength={50} required/></label>
  </FormDialog>;
}

export function TransferForm({transfer,today,accounts,onSave,onClose}:{transfer?:Transfer;today:string;accounts:Account[];onSave:(transfer:Transfer)=>void;onClose:()=>void}) {
  return <FormDialog title={transfer ? "저축·투자 수정" : "저축·투자 등록"} onClose={onClose} onSubmit={data=>{
    const title = field(data,"title"), date = field(data,"date"), amount = currency(data,"amount");
    if (!title || !validDate(date) || amount===null || amount<=0) throw new Error("이름, 날짜, 0원보다 큰 금액을 입력해 주세요.");
    onSave({id:transfer?.id ?? crypto.randomUUID(),title,date,amount,purpose:field(data,"purpose") as Transfer["purpose"],payment:paymentFrom(data,accounts)});
  }}>
    <label>이름<input name="title" defaultValue={transfer?.title} maxLength={100} required/></label>
    <label>용도<select name="purpose" defaultValue={transfer?.purpose}>{options({savings:purposes.savings,investment:purposes.investment})}</select></label>
    <label>거래일<input type="date" name="date" defaultValue={transfer?.date ?? today} required/></label>
    <label>금액 (원)<input name="amount" inputMode="decimal" defaultValue={transfer?.amount} required/></label>
    <PaymentFields accounts={accounts} payment={transfer?.payment}/>
  </FormDialog>;
}
