"use client";

import {useId,useState,type ReactNode} from "react";
import {Button} from "@/components/ui/button";
import type {Entry} from "../modules";
import {
  adjustmentKinds,caseError,equalShares,expected,installmentPlan,linkedError,paymentKinds,principal,
  repaymentKinds,roundingUnits,sum,won,type Adjustment,type Advance,type Case,type Debit,type Payment,type Receipt,type Settlements,type Split,
} from "./model";

export const newId = ()=>crypto.randomUUID();
const number = (value:string)=>value==="" ? 0 : Number(value);
const nullable = (value:string)=>value==="" ? null : Number(value);
const valueOf = (data:FormData,key:string)=>String(data.get(key) ?? "").trim();

function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  return <dialog className="dialog settlement-dialog" aria-labelledby="settlement-dialog-title" ref={node=>{if (node && !node.open) node.showModal();}} onCancel={onClose}>
    <h2 id="settlement-dialog-title">{title}</h2>{children}
  </dialog>;
}
const Actions = ({onClose}:{onClose:()=>void})=><div className="row-actions"><Button type="button" variant="outline" onClick={onClose}>취소</Button><Button type="submit">저장</Button></div>;

function AccountInput({value,accounts,onChange,label}:{value:string;accounts:string[];onChange:(value:string)=>void;label:string}) {
  const id = useId();
  return <label>{label}<input list={id} value={value} maxLength={150} onChange={event=>onChange(event.target.value)}/>
    <datalist id={id}>{accounts.map(account=><option value={account} key={account}/>)}</datalist></label>;
}

function PaymentEditor({rows,ledger,accounts,debit,onChange}:{
  rows:Payment[];ledger:Entry[];accounts:string[];debit?:boolean;onChange:(rows:Payment[])=>void;
}) {
  const change = (index:number,patch:Partial<Payment>)=>onChange(rows.map((row,i)=>i===index ? {...row,...patch} : row));
  return <fieldset className="settlement-fields">
    <legend>{debit ? "실제 카드대금 출금" : "결제 내역"}</legend>
    {rows.map((row,index)=><div key={row.id} className="settlement-inline">
      <label>기존 지출 연결<select value={row.entryId ?? ""} onChange={event=>{
        const entry = ledger.find(entry=>entry.id===event.target.value);
        if (entry) change(index,{entryId:entry.id,title:entry.title,date:entry.date,amount:entry.amount});
        else change(index,{entryId:null});
      }}><option value="">직접 기록</option>{ledger.filter(entry=>entry.group==="지출" && Number.isInteger(entry.amount) && entry.amount>0)
        .map(entry=><option key={entry.id} value={entry.id}>{entry.date} · {entry.title} · {won(entry.amount)}</option>)}</select></label>
      <label>내역<input value={row.title} onChange={event=>change(index,{title:event.target.value})} maxLength={100} required/></label>
      <label>{debit ? "출금일" : "결제일"}<input type="date" readOnly={!!row.entryId} value={row.date} onChange={event=>change(index,{date:event.target.value})} required/></label>
      <label>금액 (원)<input type="number" min="1" max="999999999" step="1" readOnly={!!row.entryId} value={row.amount || ""} onChange={event=>change(index,{amount:number(event.target.value)})} required/></label>
      {!debit && <label>결제 방식<select value={row.method} onChange={event=>change(index,{method:event.target.value as Payment["method"]})}>
        {Object.entries(paymentKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>}
      <AccountInput label={debit ? "출금계좌" : "결제수단"} value={row.account} accounts={accounts} onChange={account=>change(index,{account})}/>
      <div><Button type="button" variant="ghost" onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>{debit ? "출금 제거" : "결제 제거"}</Button></div>
    </div>)}
    <div><Button type="button" variant="outline" onClick={()=>onChange([...rows,{id:newId(),title:"",date:"",amount:0,method:"transfer",account:"",entryId:null}])}>
      {debit ? "실제 카드 출금 추가" : "결제 내역 추가"}
    </Button></div>
  </fieldset>;
}

export function emptyCase(kind:Case["kind"],today:string):Case {
  const common = {id:newId(),title:"",date:today,note:"",own:0,receipts:[],debits:[],
    payments:[{id:newId(),title:"",date:today,amount:0,method:"transfer" as const,account:"",entryId:null}]};
  return kind==="split" ? {...common,kind,due:null,people:[{id:newId(),name:"",share:0}]} :
    {...common,kind,name:"",target:null,cardInstallments:null,repayment:"free",start:null,end:null,planAmount:null,plans:[],adjustments:[]};
}

export function CaseForm({initial,cases,ledger,accounts,onSave,onClose}:{
  initial:Case;cases:Settlements;ledger:Entry[];accounts:string[];onSave:(item:Case)=>Promise<boolean>;onClose:()=>void;
}) {
  const [item,setItem] = useState(initial);
  const [unit,setUnit] = useState(1);
  const [error,setError] = useState("");
  const patch = (value:Partial<Omit<Advance,"kind"> & Omit<Split,"kind">>)=>setItem(current=>({...current,...value}));
  const nextItem = ():Case=>{
    const common = {...item,title:item.title.trim(),note:item.note.trim(),
      payments:item.payments.map(row=>({...row,title:row.title.trim(),account:row.account.trim()})),
      debits:item.debits.map(row=>({...row,title:row.title.trim(),account:row.account.trim()}))};
    return item.kind==="split" ? {...common,kind:"split",people:item.people.map(person=>({...person,name:person.name.trim()})),due:item.due}
      : {...common,kind:"advance",name:item.name.trim(),target:item.target,cardInstallments:item.cardInstallments,repayment:item.repayment,
        start:item.start,end:item.end,plans:item.plans,planAmount:item.planAmount,adjustments:item.adjustments};
  };
  return <Dialog title={item.kind==="split" ? "일반 정산" : "대납금 관리"} onClose={onClose}>
    <form onSubmit={async event=>{
      event.preventDefault();
      const next=nextItem();
      const message = !next.title || next.payments.some(row=>!row.title) || next.debits.some(row=>!row.title) ||
        (next.kind==="split" ? next.people.some(person=>!person.name) : !next.name)
        ? "이름과 결제 내역을 입력해 주세요."
        : caseError(next) || linkedError([...cases.filter(row=>row.id!==next.id),next],ledger);
      setError(message);
      if (!message && !await onSave(next)) setError("저장하지 못했습니다. 현재 데이터와 입력값을 확인해 주세요.");
    }}>
      <div className="settlement-inline">
        <label>{item.kind==="split" ? "정산명" : "대납명"}<input value={item.title} onChange={event=>patch({title:event.target.value})} required maxLength={100}/></label>
        <label>{item.kind==="split" ? "대표 결제일" : "대납일"}<input type="date" value={item.date} onChange={event=>patch({date:event.target.value})} required/></label>
        {item.kind==="split" && <label>입금 예정일<input type="date" value={item.due ?? ""} onChange={event=>patch({due:event.target.value || null})}/></label>}
        <label>본인 부담금 (원)<input type="number" min="0" max="999999999" step="1" value={item.own} onChange={event=>patch({own:number(event.target.value)})} required/></label>
      </div>
      <PaymentEditor rows={item.payments} ledger={ledger} accounts={accounts} onChange={payments=>patch({payments})}/>
      <PaymentEditor debit rows={item.debits.map(row=>({...row,method:"card"}))} ledger={ledger} accounts={accounts} onChange={rows=>{
        const debits:Debit[] = rows.map(({id,title,date,amount,account,entryId})=>({id,title,date,amount,account,entryId}));
        patch({debits});
      }}/>
      <p>총 결제 {won(principal(item))} · 본인 부담 {won(item.own)} · 받을 금액 {won(expected(item))}</p>
      {item.kind==="split" ? <fieldset className="settlement-fields">
        <legend>참석자별 차등 정산</legend>
        {item.people.map(person=><div key={person.id} className="settlement-inline">
          <label>이름 또는 별명<input value={person.name} maxLength={100} required onChange={event=>patch({
            people:item.people.map(row=>row.id===person.id ? {...row,name:event.target.value} : row),
          })}/></label>
          <label>부담금 (원)<input type="number" min="0" max="999999999" step="1" value={person.share} required onChange={event=>patch({
            people:item.people.map(row=>row.id===person.id ? {...row,share:number(event.target.value)} : row),
          })}/></label>
          <div><Button type="button" variant="ghost" disabled={item.receipts.some(row=>row.personId===person.id)} onClick={()=>patch({people:item.people.filter(row=>row.id!==person.id)})}>참석자 제거</Button></div>
        </div>)}
        <div className="row-actions">
          <Button type="button" variant="outline" onClick={()=>patch({people:[...item.people,{id:newId(),name:"",share:0}]})}>참석자 추가</Button>
          <Button type="button" variant="outline" onClick={()=>patch({own:Math.max(0,principal(item)-sum(item.people.map(person=>person.share)))})}>본인 부담금 계산</Button>
        </div>
        <label>균등 정산 절사 단위<select value={unit} onChange={event=>setUnit(Number(event.target.value))}>{roundingUnits.map(value=><option key={value}>{value}</option>)}</select></label>
        <div><Button type="button" variant="outline" onClick={()=>{
          const result=equalShares(principal(item),item.people.length,unit);
          patch({own:result.own,people:item.people.map(person=>({...person,share:result.share}))});
        }}>균등 정산 적용</Button></div>
      </fieldset> : <fieldset className="settlement-fields">
        <legend>상대방 상환 계획</legend>
        <div className="settlement-inline">
          <label>상환 대상자<input value={item.name} onChange={event=>patch({name:event.target.value})} maxLength={100} required/></label>
          <label>확정 상환 예정액 (원)<input type="number" min="0" max="999999999" step="1" placeholder="미확정 시 원금 − 본인 부담" value={item.target ?? ""} onChange={event=>patch({target:nullable(event.target.value)})}/></label>
          <label>카드 할부 개월<input type="number" min="1" max="120" step="1" placeholder="미지정 / 1개월은 일시불" value={item.cardInstallments ?? ""} onChange={event=>patch({cardInstallments:nullable(event.target.value)})}/></label>
          <label>상환 방식<select value={item.repayment} onChange={event=>patch({repayment:event.target.value as typeof item.repayment})}>
            {Object.entries(repaymentKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>상환 시작일<input type="date" value={item.start ?? ""} onChange={event=>patch({start:event.target.value || null})}/></label>
          <label>종료 예정일<input type="date" value={item.end ?? ""} onChange={event=>patch({end:event.target.value || null})}/></label>
          {item.repayment==="regular" && <label>매월 상환 예정 금액 (원)<input type="number" min="1" max="999999999" step="1" value={item.planAmount ?? ""} onChange={event=>patch({planAmount:nullable(event.target.value)})}/></label>}
        </div>
        <div className="row-actions">
          {item.repayment!=="free" && <Button type="button" variant="outline" onClick={()=>{
            try {
              const plans=item.repayment==="regular" ? installmentPlan(item.start ?? "",item.end,item.planAmount,Math.max(0,expected(item)),newId) :
                [{id:newId(),date:item.end ?? item.start,amount:item.target ?? null}];
              patch({plans});setError("");
            } catch (failure) {setError((failure as Error).message);}
          }}>회차 자동 생성·교체</Button>}
          <Button type="button" variant="outline" onClick={()=>patch({plans:[...item.plans,{id:newId(),date:null,amount:null}]})}>회차 직접 추가</Button>
        </div>
        {item.plans.map((plan,index)=><div key={plan.id} className="settlement-inline">
          <label>{index+1}회차 예정일<input type="date" value={plan.date ?? ""} onChange={event=>patch({
            plans:item.plans.map(row=>row.id===plan.id ? {...row,date:event.target.value || null} : row),
          })}/></label>
          <label>회차 금액 (원)<input type="number" min="0" max="999999999" step="1" value={plan.amount ?? ""} onChange={event=>patch({
            plans:item.plans.map(row=>row.id===plan.id ? {...row,amount:nullable(event.target.value)} : row),
          })}/></label>
          <div><Button type="button" variant="ghost" onClick={()=>patch({plans:item.plans.filter(row=>row.id!==plan.id)})}>회차 제거</Button></div>
        </div>)}
      </fieldset>}
      <label>메모<textarea value={item.note} maxLength={1000} onChange={event=>patch({note:event.target.value})}/></label>
      {error && <p role="alert" className="utility-errors">{error}</p>}
      <Actions onClose={onClose}/>
    </form>
  </Dialog>;
}

export function ReceiptForm({personId,initial,today,accounts,ledger,onSave,onClose}:{
  personId:string;initial?:Receipt;today:string;accounts:string[];ledger:Entry[];onSave:(row:Receipt)=>Promise<string>;onClose:()=>void;
}) {
  const [id] = useState(()=>initial?.id ?? newId());
  const [account,setAccount] = useState(initial?.account ?? "");
  const [entryId,setEntryId] = useState(initial?.entryId ?? "");
  const linked = ledger.find(row=>row.id===entryId);
  const [date,setDate] = useState(initial?.date ?? today);
  const [amount,setAmount] = useState<string>(String(initial?.amount ?? ""));
  const [error,setError] = useState("");
  return <Dialog title={initial ? "입금 수정" : "입금 기록"} onClose={onClose}>
    <form onSubmit={async event=>{
      event.preventDefault();
      const data=new FormData(event.currentTarget);
      setError(await onSave({id,personId,date:valueOf(data,"date"),amount:number(valueOf(data,"amount")),
        account:account.trim(),note:valueOf(data,"note"),entryId:entryId || null}));
    }}>
      <label>기존 수입 연결<select value={entryId} onChange={event=>{
        const entry=ledger.find(row=>row.id===event.target.value);
        setEntryId(event.target.value);
        if (entry) {setDate(entry.date);setAmount(String(entry.amount));}
      }}><option value="">직접 기록</option>{ledger.filter(row=>row.group==="수입" && Number.isInteger(row.amount) && row.amount>0)
        .map(row=><option key={row.id} value={row.id}>{row.date} · {row.title} · {won(row.amount)}</option>)}</select></label>
      {linked && <p className="muted">연결된 입금의 날짜와 금액은 가계부 원본을 따릅니다. 다른 거래를 선택하거나 연결을 해제하면 변경할 수 있습니다.</p>}
      {initial?.entryId && initial.entryId!==entryId && <p className="muted">연결을 바꾸면 기존 가계부 원본 거래는 유지되며 수입으로 다시 집계됩니다.</p>}
      <label>실제 입금일<input name="date" type="date" readOnly={!!linked} value={date} onChange={event=>setDate(event.target.value)} required/></label>
      <label>입금액 (원)<input name="amount" type="number" min="1" max="999999999" step="1" readOnly={!!linked} value={amount} onChange={event=>setAmount(event.target.value)} required/></label>
      <AccountInput label="입금계좌" value={account} accounts={accounts} onChange={setAccount}/>
      <label>메모<textarea name="note" defaultValue={initial?.note} maxLength={1000}/></label>
      {error && <p role="alert">{error}</p>}
      <Actions onClose={onClose}/>
    </form>
  </Dialog>;
}

export function AdjustmentForm({today,onSave,onClose}:{today:string;onSave:(row:Adjustment)=>Promise<string>;onClose:()=>void}) {
  const [error,setError] = useState("");
  return <Dialog title="대납 잔액 조정" onClose={onClose}>
    <form onSubmit={async event=>{
      event.preventDefault();
      const data=new FormData(event.currentTarget);
      setError(await onSave({id:newId(),date:valueOf(data,"date"),amount:number(valueOf(data,"amount")),
        kind:valueOf(data,"kind") as Adjustment["kind"],note:valueOf(data,"note")}));
    }}>
      <label>구분<select name="kind">{Object.entries(adjustmentKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>조정일<input name="date" type="date" defaultValue={today} required/></label>
      <label>조정액 (원)<input name="amount" type="number" min="1" max="999999999" step="1" required/></label>
      <label>메모<textarea name="note" maxLength={1000}/></label>
      {error && <p role="alert">{error}</p>}
      <Actions onClose={onClose}/>
    </form>
  </Dialog>;
}
