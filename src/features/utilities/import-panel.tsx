"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportBills, importBills } from "./import";
import { kindNames, managementFields, managementKeys, needsResidenceConfirmation, replaceBills, scopeNames, type Bill, type UtilityState, type Scope } from "./model";

export function downloadBills(bills:Bill[]) {
  const url = URL.createObjectURL(new Blob([exportBills(bills)],{type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "onharu-housing-bills.csv";
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function ImportPanel({state,onImport,onClose}:{state:UtilityState;onImport:(bills:Bill[],confirmed:boolean)=>void;onClose:()=>void}) {
  const [source,setSource] = useState("");
  const [preview,setPreview] = useState<ReturnType<typeof importBills>>([]);
  const [snapshot,setSnapshot] = useState("");
  const [confirm,setConfirm] = useState(false);
  const [scope,setScope] = useState<Scope|"">("");
  const [outside,setOutside] = useState(false);
  const [error,setError] = useState("");
  const duplicate = preview.some(row=>row.duplicate);
  const changes = preview.flatMap(row=>row.bill ? [row.bill] : []);
  const warns = needsResidenceConfirmation(state,{...state,bills:replaceBills(state.bills,changes)});
  const ready = preview.length>0 && !preview.some(row=>row.errors.length) && (!duplicate || confirm) && (!warns || outside);
  function update(text:string) {
    setSource(text);
    setPreview([]);
    setConfirm(false);
    setOutside(false);
    setError("");
  }

  return <dialog ref={node=>{if (node && !node.open) node.showModal();}} onCancel={onClose} aria-labelledby="utility-import" className="dialog utility-dialog import-dialog">
    <h2 id="utility-import">관리비·가스비 가져오기</h2>
    <p className="muted">Excel에서 복사한 표, Markdown 표 또는 머리글이 있는 CSV를 사용하세요. 청구월은 YYYY-MM입니다.</p>
    <form onSubmit={event=>{
      event.preventDefault();
      setConfirm(false);
      setOutside(false);
      setError("");
      try {
        setPreview(importBills(source,state.bills,state.residence,scope || undefined));
        setSnapshot(JSON.stringify(state));
      } catch (failure) {
        setPreview([]);
        setError((failure as Error).message);
      }
    }}>
      <label>CSV 파일<input type="file" accept=".csv,text/csv" onChange={async event=>{
        const field = event.currentTarget;
        const file = field.files?.[0];
        if (!file) return;
        field.value = "";
        if (file.size>500_000) {
          update("");
          setError("파일은 최대 500KB까지 사용할 수 있습니다.");
          return;
        }
        try { update(await file.text()); }
        catch { setError("파일을 읽을 수 없습니다."); }
      }}/></label>
      <label>가져올 데이터 유형<select value={scope} onChange={event=>{setScope(event.target.value as Scope|"");update(source);}}>
        <option value="">파일의 데이터 유형 사용</option>{Object.entries(scopeNames).map(([key,label])=><option key={key} value={key}>모두 {label}</option>)}
      </select></label>
      <label>표 붙여넣기<textarea rows={5} value={source} onChange={event=>update(event.target.value)} maxLength={500_000} placeholder={"청구월\t구분\t관리비 합계\t가스요금"}/></label>
      <div className="row-actions"><Button variant="outline" type="button" onClick={()=>downloadBills([])}>CSV 양식 받기</Button><Button type="submit">미리보기</Button></div>
    </form>
    {error && <p role="alert" className="utility-errors">{error}</p>}
    {!!preview.length && <section className="import-preview">
      <h3>가져오기 미리보기</h3>
      <p className="muted">빈 셀은 미확인 값으로 저장됩니다. 표에 없는 열은 기존 값을 유지합니다. 새 행의 데이터 유형이 없으면 참고용으로 저장합니다. 일괄 지정하면 표의 데이터 유형보다 우선합니다.</p>
      <ul aria-label="가져올 청구 목록">{preview.map(({line,bill,errors,warnings,duplicate},index)=><li key={index}>
        <strong>{line}행 {bill && bill.month+" · "+kindNames[bill.kind]+" · "+scopeNames[bill.scope]}</strong>
        <span>{errors.length ? errors.join(" / ") : duplicate ? "기존 내역 수정" : "새로 등록"}</span>
        {!!warnings.length && <small className="utility-errors">{warnings.join(" ")}</small>}
        {bill && <small>{(bill.kind==="management"
          ? managementKeys.map(key=>[managementFields[key].label,bill[key]])
          : [["가스요금",bill.gas],["가스 시작일",bill.start],["가스 종료일",bill.end]]
        ).map(([label,value])=>label+" "+(value ?? "—")).join(" · ")}{bill.note && " · 비고 "+bill.note}</small>}
      </li>)}</ul>
      {duplicate && <label><input type="checkbox" checked={confirm} onChange={event=>setConfirm(event.target.checked)}/>청구월·청구 종류·데이터 유형이 같은 기존 내역 수정을 확인했습니다.</label>}
      {warns && <label><input type="checkbox" checked={outside} onChange={event=>setOutside(event.target.checked)}/>거주 기간과 겹치지 않는 청구를 실제 관리비로 저장합니다.</label>}
    </section>}
    <div className="row-actions"><Button variant="outline" onClick={onClose}>닫기</Button><Button disabled={!ready} onClick={()=>{
      if (snapshot!==JSON.stringify(state)) {
        setError("저장된 내역이 변경되었습니다. 미리보기를 다시 실행해 주세요.");
        return;
      }
      onImport(changes,outside);
    }}>등록 적용</Button></div>
  </dialog>;
}
