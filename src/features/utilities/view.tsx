"use client";

import { useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { billKey, blankBill, housing, kindNames, managementBreakdown, managementFields, managementKeys,
  metrics, missing, monthlyBills, personalStatistics, replaceBills, scopeNames, validDate, withinResidence,
  type Bill, type Residence, type Scope, type UtilityState } from "./model";
import { UtilityCharts } from "./charts";
import { UtilityComparison } from "./comparison";
import { BillEditor } from "./editor";
import { downloadBills, ImportPanel } from "./import-panel";
import type { Entry } from "../modules";

const number = new Intl.NumberFormat("ko-KR",{maximumFractionDigits:3});
const money = (amount:number|null) => amount===null ? missing : number.format(amount)+"원";
const amountText = (amount:number|null|undefined,unit:string) => amount==null ? missing : number.format(amount)+unit;

function ResidenceSettings({residence,onSave}:{residence:Residence;onSave:(value:Residence)=>void}) {
  const [error,setError] = useState("");
  return <details className="panel utility-residence">
    <summary><strong>거주 기간</strong> <span className="muted">{residence.start ?? "시작일 미설정"} ~ {residence.end ?? "종료일 미설정"}</span></summary>
    <form key={JSON.stringify(residence)} onSubmit={event=>{
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const start = String(data.get("start") ?? "") || null;
      const end = String(data.get("end") ?? "") || null;
      if ((start && !validDate(start)) || (end && (!validDate(end) || !start || end<start))) {
        setError("거주 시작일과 종료일의 순서를 확인해 주세요.");
        return;
      }
      setError("");
      onSave({start,end});
    }}>
      <div className="utility-fields">
        <label>거주 시작일<input name="start" type="date" defaultValue={residence.start ?? ""}/></label>
        <label>거주 종료일<input name="end" type="date" defaultValue={residence.end ?? ""}/></label>
      </div>
      <p className="muted">청구월이나 가스 사용 기간이 거주 기간에 일부라도 겹치면 등록할 수 있습니다. 거주 기간 설정을 바꿔도 저장된 데이터 유형과 금액은 유지됩니다.</p>
      {error && <p role="alert">{error}</p>}
      <div><Button type="submit">거주 기간 저장</Button></div>
    </form>
  </details>;
}

function BillDetails({bill}:{bill:Bill}) {
  const breakdown = bill.kind==="management" ? managementBreakdown(bill) : null;
  return <details className="utility-details"><summary>상세</summary>
    <table aria-label={bill.month+" "+kindNames[bill.kind]+" 상세"}><tbody>
      {bill.kind==="management" ? managementKeys.map(key=><tr key={key}><th scope="row">{managementFields[key].label}</th><td>{amountText(bill[key],managementFields[key].unit)}</td></tr>) : <>
        <tr><th scope="row">가스요금</th><td>{money(bill.gas)}</td></tr>
        <tr><th scope="row">사용 시작일</th><td>{bill.start ?? missing}</td></tr>
        <tr><th scope="row">사용 종료일</th><td>{bill.end ?? missing}</td></tr>
      </>}
      {bill.kind==="management" && <>
        {bill.parkingInBase && <tr><th scope="row">주차비 처리</th><td>기본 관리비에 포함</td></tr>}
        <tr><th scope="row">주차비 제외 관리비</th><td>{bill.parking==null ? "주차비 미입력" : money(metrics([bill]).withoutParking)}</td></tr>
      </>}
      {breakdown && <>
        <tr><th scope="row">세부 항목 합계{breakdown.complete ? "" : " (확인분)"}</th><td>{money(breakdown.subtotal)}</td></tr>
        <tr><th scope="row">차액 (고지서 − 세부 합계)</th><td>{money(breakdown.difference)}{breakdown.difference!==null && !breakdown.complete && " · 확인분 기준"}</td></tr>
      </>}
      <tr><th scope="row">비고</th><td>{bill.note || missing}</td></tr>
    </tbody></table>
  </details>;
}

type Filter = "all" | Scope;
export function UtilitiesView({state,save,today,legacy}:{state:UtilityState;save:(value:UtilityState,confirmed?:boolean)=>Promise<boolean>;today:string;legacy:Entry[]}) {
  const {bills,residence} = state;
  const current = today.slice(0,7);
  const [year,setYear] = useState(current.slice(0,4));
  const [month,setMonth] = useState("");
  const [scope,setScope] = useState<Filter>("all");
  const [editing,setEditing] = useState<{bill:Bill;originalKey?:string}|null>(null);
  const [deleting,setDeleting] = useState<Bill|null>(null);
  const [importing,setImporting] = useState(false);
  const [status,setStatus] = useState("");
  const years = [...new Set([current.slice(0,4),...bills.map(bill=>bill.month.slice(0,4))])].sort().reverse();
  const visible = bills.filter(bill=>(!year || bill.month.startsWith(year)) && (!month || bill.month.endsWith(month)) && (scope==="all" || bill.scope===scope))
    .sort((a,b)=>b.month.localeCompare(a.month) || b.kind.localeCompare(a.kind));
  const aggregate = personalStatistics(visible);
  const entryMonth = year && month ? year+month : visible[0]?.month ?? (year ? year+(year===current.slice(0,4) ? current.slice(4) : "-12") : current);
  function create(kind:Bill["kind"]) {
    const type = scope==="all" ? withinResidence(entryMonth,residence) ? "personal" : "reference" : scope;
    setEditing({bill:blankBill(kind,entryMonth,type)});
  }
  const grouped = monthlyBills(visible);
  return <>
    <div className="page-title utility-title">
      <div><h1>관리비 및 공과금</h1><p className="muted">월별 고지서와 가스비를 관리하고 거주 기간의 지출을 확인하세요.</p></div>
      <div className="row-actions">
        <Button onClick={()=>create("management")}><Plus size={16}/>관리비 등록</Button>
        <Button variant="outline" onClick={()=>create("gas")}><Plus size={16}/>가스비 등록</Button>
        <Button variant="outline" onClick={()=>setImporting(true)}><Upload size={16}/>가져오기</Button>
        <Button variant="outline" disabled={!visible.length} onClick={()=>downloadBills(visible)}><Download size={16}/>CSV 내보내기</Button>
      </div>
    </div>
    <ResidenceSettings residence={residence} onSave={async next=>{
      if (!await save({residence:next,bills})) return;
      setStatus("거주 기간을 저장했습니다.");
    }}/>
    <section className="panel utility-filters" aria-label="조회 조건">
      <label>연도<select value={year} onChange={event=>setYear(event.target.value)}><option value="">전체 연도</option>{years.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>월<select value={month} onChange={event=>setMonth(event.target.value)}><option value="">전체 월</option>{Array.from({length:12},(_,index)=><option key={index} value={"-"+String(index+1).padStart(2,"0")}>{index+1}월</option>)}</select></label>
      <label>데이터 유형<select value={scope} onChange={event=>setScope(event.target.value as Filter)}><option value="all">전체 데이터</option>{Object.entries(scopeNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    </section>
    {status && <p className="utility-status" role="status">{status}</p>}
    <div className="stats utility-stats">
      <div className="panel stat"><span>조회 기간 본인 지출 합계</span><strong>{money(aggregate.total)}</strong></div>
      <div className="panel stat"><span>조회 기간 본인 월평균</span><strong>{money(aggregate.average)}</strong></div>
      <div className="panel stat"><span>금액이 있는 본인 청구월</span><strong>{aggregate.months}개월</strong></div>
    </div>
    <UtilityComparison bills={bills} currentMonth={current} scope={scope}/>
    <section className="panel">
      <h2>월별 상세 내역</h2>
      <p className="muted">—는 미청구 또는 미확인입니다. 확인분은 등록된 금액만 합산합니다.</p>
      {!grouped.size ? <p className="empty">조회 조건에 맞는 청구 내역이 없습니다.</p> : [...grouped].map(([month,rows])=>{
        return <section key={month} className="utility-month">
          <h3>{month}</h3>
          {(["personal","reference"] as const).map(scope=>{
            const entries = rows.filter(bill=>bill.scope===scope);
            if (!entries.length) return null;
            const total = housing(entries);
            return <div key={scope} className="utility-group">
              <p><strong>{scopeNames[scope]}</strong> <span>총 주거비 {money(total.total)}{total.total!==null && !total.complete ? " · 확인분" : ""}</span></p>
              <ul className="utility-bills">{entries.map(bill=><li key={billKey(bill)}>
                <div className="utility-bill-heading"><strong>{kindNames[bill.kind]}</strong><span>{money(bill.kind==="gas" ? bill.gas : bill.total)}</span></div>
                <div className="row-actions"><Button variant="outline" aria-label={month+" "+kindNames[bill.kind]+" 수정 ("+scopeNames[bill.scope]+")"} onClick={()=>setEditing({bill,originalKey:billKey(bill)})}>수정</Button>
                  <Button variant="ghost" aria-label={month+" "+kindNames[bill.kind]+" 삭제 ("+scopeNames[bill.scope]+")"} onClick={()=>setDeleting(bill)}>삭제</Button></div>
                <BillDetails bill={bill}/>
              </li>)}</ul>
            </div>;
          })}
        </section>;
      })}
    </section>
    <UtilityCharts bills={visible}/>
    {!!legacy.length && <details className="panel"><summary>이전 형식의 공과금 기록</summary><p className="muted">이전 기록은 아래에서 확인할 수 있습니다. 청구 종류와 사용 구분을 확인한 뒤 월별 청구로 등록하세요.</p>
      <ul>{legacy.map(row=><li key={row.id}>{row.date} · {row.title} · {money(row.amount)} · {row.detail}</li>)}</ul></details>}
    {editing && <BillEditor {...editing} bills={bills} residence={residence} onClose={()=>setEditing(null)} onSave={async (changes,confirmed)=>{
      const [bill] = changes;
      if (!await save({...state,bills:replaceBills(bills.filter(item=>billKey(item)!==editing.originalKey),changes)},confirmed)) return;
      setEditing(null);
      setYear(bill.month.slice(0,4));
      if (month) setMonth(bill.month.slice(4));
      setScope("all");
      setStatus("청구 내역을 저장했습니다.");
    }}/>}
    {importing && <ImportPanel state={state} onClose={()=>setImporting(false)} onImport={async (changes,confirmed)=>{
      if (!await save({...state,bills:replaceBills(bills,changes)},confirmed)) return;
      setImporting(false);
      const last = changes.map(bill=>bill.month).sort().at(-1);
      if (last) setYear(last.slice(0,4));
      setMonth("");
      setScope("all");
      setStatus(changes.length+"건을 가져왔습니다.");
    }}/>}
    {deleting && <dialog ref={node=>{if (node && !node.open) node.showModal();}} onCancel={()=>setDeleting(null)} aria-labelledby="utility-delete" className="dialog">
      <h2 id="utility-delete">청구 삭제</h2><p>{deleting.month} {scopeNames[deleting.scope]} · {kindNames[deleting.kind]} 내역을 삭제할까요?</p>
      <div className="row-actions"><Button variant="outline" onClick={()=>setDeleting(null)}>취소</Button><Button onClick={async ()=>{
        if (!await save({...state,bills:bills.filter(bill=>billKey(bill)!==billKey(deleting))})) return;
        setDeleting(null);
        setStatus("청구 내역을 삭제했습니다.");
      }}>삭제</Button></div>
    </dialog>}
  </>;
}
