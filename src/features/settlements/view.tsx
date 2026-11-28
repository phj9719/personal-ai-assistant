"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import type {Save} from "@/components/workspace-data";
import type {Entry} from "../modules";
import {AdjustmentForm,CaseForm,emptyCase,newId,ReceiptForm} from "./forms";
import {
  adjusted,adjustmentKinds,balance,caseError,caseStatus,expected,linkedError,openPlans,paymentState,peopleOf,personBalance,principal,
  paymentKinds,receivableStats,received,repaymentKinds,shareText,won,type Case,type Person,type Receipt,type Settlements,
} from "./model";

const sections = ["일반 정산","대납금 관리","입금 이력","미수금 현황"] as const;
type PaymentEditor = {item:Case;person:Person;receipt?:Receipt};
type Removal = {title:string;description:string;apply:()=>Promise<boolean>};

export function SettlementsView({cases,save,ledger,accounts,today}:{
  cases:Settlements;save:Save<Settlements>;ledger:Entry[];accounts:string[];today:string;
}) {
  const [section,setSection] = useState(0);
  const [query,setQuery] = useState("");
  const [from,setFrom] = useState("");
  const [to,setTo] = useState("");
  const [state,setState] = useState("all");
  const [month,setMonth] = useState(today.slice(0,7));
  const [editing,setEditing] = useState<Case|null>(null);
  const [payment,setPayment] = useState<PaymentEditor|null>(null);
  const [adjusting,setAdjusting] = useState<Case|null>(null);
  const [remove,setRemove] = useState<Removal|null>(null);
  const [share,setShare] = useState("");
  const [notice,setNotice] = useState("");
  const term = query.trim().toLowerCase();
  const within = (date:string)=>(!from || date>=from) && (!to || date<=to);
  const filtered = cases.filter(item=>(state==="all" || (state==="done")===(balance(item)===0)) &&
    [item.title,...peopleOf(item).map(person=>person.name)].some(text=>text.toLowerCase().includes(term)))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const matching = filtered.filter(item=>within(item.date));
  const stats = receivableStats(matching,month || today.slice(0,7),today);
  const history = filtered.flatMap(item=>item.receipts.filter(row=>within(row.date)).map(row=>({item,row})))
    .sort((a,b)=>b.row.date.localeCompare(a.row.date));
  function commit(next:Case) {
    const existing = cases.some(item=>item.id===next.id);
    return save(existing ? cases.map(item=>item.id===next.id ? next : item) : [next,...cases]);
  }
  async function recordReceipt(row:Receipt) {
    if (!payment) return "";
    const next = {...payment.item,receipts:[...payment.item.receipts.filter(item=>item.id!==row.id),row]};
    const issue = caseError(next) || linkedError(cases.map(item=>item.id===next.id ? next : item),ledger);
    if (issue) return issue;
    if (await commit(next)) setPayment(null);
    return "";
  }
  function removeReceipt(item:Case,row:Receipt) {
    setRemove({title:"입금 취소",description:row.date+"에 기록한 "+won(row.amount)+" 입금을 취소할까요?",
      apply:()=>commit({...item,receipts:item.receipts.filter(receipt=>receipt.id!==row.id)})});
  }
  async function togglePaid(item:Case,person:Person) {
    const outstanding=personBalance(item,person);
    if (outstanding>0) {
      const previous = item.receipts.filter(row=>row.personId===person.id);
      if (previous.length>=500) return;
      const row:Receipt = {id:newId(),personId:person.id,date:today,amount:outstanding,account:"",entryId:null,note:"완료 체크로 기록",quick:true};
      await commit({...item,receipts:[...item.receipts,row]});
    } else {
      const quick = item.receipts.findLast(row=>row.personId===person.id && row.quick);
      if (quick) {removeReceipt(item,quick);return;}
      setRemove({title:"입금 완료 해제",description:"이 참석자의 입금 내역을 모두 취소할까요? 특정 건만 취소하려면 입금 이력을 이용하세요.",
        apply:()=>commit({...item,receipts:item.receipts.filter(row=>row.personId!==person.id)})});
    }
  }

  return <>
    <div className="page-title finance-heading"><div><h1>정산·대납 관리</h1><p className="muted">함께 결제한 금액과 대신 낸 금액의 입금 상태를 확인합니다.</p></div>
      {section<2 && <Button onClick={()=>setEditing(emptyCase(section===0 ? "split" : "advance",today))}>{section===0 ? "정산 등록" : "대납 등록"}</Button>}
    </div>
    <nav aria-label="정산·대납 메뉴" className="finance-tabs">{sections.map((label,index)=>
      <button type="button" key={label} aria-pressed={section===index} onClick={()=>{setSection(index);setNotice("");}}>{label}</button>)}</nav>
    <section className="panel utility-filters" aria-label="정산·대납 조회 조건">
      <label>정산명·대상자 검색<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="이름 또는 별명"/></label>
      <label>{section===2 ? "입금일 시작" : "결제일 시작"}<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label>
      <label>{section===2 ? "입금일 종료" : "결제일 종료"}<input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label>
      <label>상태<select aria-label="상태" value={state} onChange={event=>setState(event.target.value)}>
        <option value="all">전체</option><option value="active">진행 중</option><option value="done">완료</option>
      </select></label>
    </section>
    {notice && <p role="status">{notice}</p>}
    {section<2 && <div className="settlement-cards">{matching.filter(item=>item.kind===(section===0 ? "split" : "advance")).map(item=>
      <section className="panel settlement-case" key={item.id}>
        <div className="finance-heading"><div><h2>{item.title}</h2><p className="muted">{item.date} · {caseStatus(item,today)}</p></div>
          <div className="row-actions">
            {item.kind==="split" && <Button variant="outline" onClick={()=>{setShare(shareText(item));setNotice("");}}>카카오톡 안내 문구</Button>}
            <Button variant="outline" onClick={()=>setEditing(item)} aria-label={item.title+" 수정"}>수정</Button>
            <Button variant="ghost" disabled={!!(item.receipts.length || item.debits.length || adjusted(item))} onClick={()=>setRemove({
              title:"내역 삭제",description:"정산·대납을 삭제할까요? 연결된 가계부 원본 거래는 유지됩니다.",
              apply:()=>save(cases.filter(row=>row.id!==item.id)),
            })} aria-label={item.title+" 삭제"}>삭제</Button>
          </div>
        </div>
        <p>결제 {won(principal(item))} · 본인 부담 {won(item.own)} · 받을 금액 {won(expected(item))}{item.kind==="advance" && item.target===null ? " (미확정)" : ""}</p>
        <p>받은 금액 {won(received(item))} · 남은 미수금 {won(balance(item))}</p>
        {item.note && <p className="muted">{item.note}</p>}
        {item.kind==="split" && item.due && <p className="muted">입금 예정일 {item.due}</p>}
        {item.kind==="advance" && <>
          <p>{repaymentKinds[item.repayment]} · 상환 기간 {item.start ?? "미지정"} ~ {item.end ?? "미지정"}</p>
          <p>카드 결제 {item.cardInstallments===null ? "할부 정보 미지정" : item.cardInstallments===1 ? "일시불" : item.cardInstallments+"개월 할부"} · 잔액 조정 {won(adjusted(item))}</p>
          <details><summary>상환 회차 및 조정 내역</summary>
            {!item.plans.length && <p className="muted">등록된 예정 회차가 없습니다.</p>}
            <ul className="rows">{openPlans(item).map((plan,index)=><li key={index}><span>{plan.date ?? "예정일 미지정"}</span>
              <span>남은 예정액 {plan.amount===null ? "미지정" : won(plan.amount)}</span></li>)}</ul>
            <ul className="rows">{item.adjustments.map(row=><li key={row.id}><span>{row.date} · {adjustmentKinds[row.kind]} · {won(row.amount)} {row.note}</span>
              <Button variant="ghost" onClick={()=>setRemove({title:"잔액 조정 취소",description:"이 조정을 취소하고 미수금에 다시 반영할까요?",
                apply:()=>commit({...item,adjustments:item.adjustments.filter(adjustment=>adjustment.id!==row.id)})})}>조정 취소</Button>
            </li>)}</ul>
          </details>
          <Button variant="outline" disabled={balance(item)===0} onClick={()=>setAdjusting(item)}>면제·본인 부담 전환</Button>
        </>}
        <details><summary>결제 원금 및 카드 출금</summary>
          <ul className="rows">{item.payments.map(row=><li key={row.id}><span>{row.date} · {row.title} · {paymentKinds[row.method]}{row.account && " · "+row.account}{row.entryId && " · 기존 거래 연결"}</span><strong>{won(row.amount)}</strong></li>)}</ul>
          <ul className="rows">{item.debits.map(row=><li key={row.id}><span>{row.date} · {row.title} · 카드대금 출금{row.account && " · "+row.account}{row.entryId && " · 기존 거래 연결"}</span><strong>{won(row.amount)}</strong></li>)}</ul>
        </details>
        <ul className="rows finance-rows">{peopleOf(item).map(person=>{
          const left=personBalance(item,person), paid=received(item,person.id);
          return <li key={person.id}>
            <div><strong>{person.name}</strong><p>부담 {won(person.share)} · 입금 {won(paid)} · 남은 금액 {won(left)} · {paymentState(paid,left)}</p></div>
            <div className="row-actions">
              {item.kind==="split" && <label><input type="checkbox" checked={left===0} disabled={person.share===0}
                onChange={()=>void togglePaid(item,person)}/>{person.name} 입금 완료</label>}
              <Button variant="outline" disabled={left===0} onClick={()=>setPayment({item,person})}>입금 기록</Button>
            </div>
          </li>;
        })}</ul>
      </section>,
    )}{!matching.some(item=>item.kind===(section===0 ? "split" : "advance")) && <p className="empty">조회 조건에 맞는 내역이 없습니다.</p>}</div>}
    {section===2 && <section className="panel"><h2>입금 이력</h2>
      {!history.length && <p className="empty">조회 조건에 맞는 입금이 없습니다.</p>}
      <ul className="rows finance-rows">{history.map(({item,row})=>{
        const person=peopleOf(item).find(person=>person.id===row.personId);
        return person && <li key={row.id}><div><strong>{item.title} · {person.name}</strong>
          <p>{row.date} · {won(row.amount)} · {row.account || "입금계좌 미지정"}{row.entryId && " · 기존 거래 연결"}</p>{row.note && <p>{row.note}</p>}</div>
          <div className="row-actions"><Button variant="outline" onClick={()=>setPayment({item,person,receipt:row})}>입금 수정</Button>
            <Button variant="ghost" onClick={()=>removeReceipt(item,row)}>입금 취소</Button></div>
        </li>;
      })}</ul>
    </section>}
    {section===3 && <>
      <label>통계 조회 월<input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>
      <div className="stats">{([
        ["전체 정산 예정액",won(stats.splits)],["전체 대납금",won(stats.advances)],["실제 받은 금액",won(stats.received)],["남은 미수금",won(stats.balance)],
        ["조회 월 입금 예정",won(stats.scheduled)+(stats.unknownScheduled ? " + 미정 "+stats.unknownScheduled+"건" : "")],
        ["조회 월 실제 입금",won(stats.monthlyReceived)],["예정일이 지난 금액",won(stats.overdue)],["완료 / 진행 중",stats.completed+"건 / "+stats.active+"건"],
      ]).map(([label,value])=><div className="panel stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section className="panel"><h2>대상자별 미수금</h2>{!stats.people.length && <p className="empty">남은 미수금이 없습니다.</p>}
        <ul className="rows">{stats.people.map(([name,amount])=><li key={name}><span>{name}</span><strong>{won(amount)}</strong></li>)}</ul></section>
    </>}
    {editing && <CaseForm initial={editing} cases={cases} ledger={ledger} accounts={accounts} onClose={()=>setEditing(null)} onSave={async item=>{
      const saved=await commit(item);
      if (saved) setEditing(null);
      return saved;
    }}/>}
    {payment && <ReceiptForm personId={payment.person.id} initial={payment.receipt} accounts={accounts} today={today} ledger={ledger} onClose={()=>setPayment(null)} onSave={recordReceipt}/>}
    {adjusting?.kind==="advance" && <AdjustmentForm today={today} onClose={()=>setAdjusting(null)} onSave={async row=>{
      const next={...adjusting,adjustments:[...adjusting.adjustments,row]};
      const issue=caseError(next);
      if (issue) return issue;
      if (await commit(next)) setAdjusting(null);
      return "";
    }}/>}
    {remove && <dialog className="dialog" aria-labelledby="settlement-confirm" ref={node=>{if (node && !node.open) node.showModal();}} onCancel={()=>setRemove(null)}>
      <h2 id="settlement-confirm">{remove.title}</h2><p>{remove.description}</p>
      <div className="row-actions"><Button variant="outline" onClick={()=>setRemove(null)}>닫기</Button><Button onClick={async ()=>{if (await remove.apply()) setRemove(null);}}>확인</Button></div>
    </dialog>}
    {share && <dialog className="dialog settlement-dialog" aria-labelledby="settlement-share" ref={node=>{if (node && !node.open) node.showModal();}} onCancel={()=>setShare("")}>
      <h2 id="settlement-share">카카오톡 안내 문구</h2>
      <label>정산 안내<textarea value={share} readOnly rows={7}/></label>{notice && <p role="status">{notice}</p>}
      <div className="row-actions"><Button variant="outline" onClick={()=>setShare("")}>닫기</Button><Button onClick={async ()=>{
        try {await navigator.clipboard.writeText(share);setNotice("안내 문구를 복사했습니다.");setShare("");}
        catch {setNotice("텍스트를 직접 선택해서 복사해 주세요.");}
      }}>복사</Button></div>
    </dialog>}
  </>;
}
