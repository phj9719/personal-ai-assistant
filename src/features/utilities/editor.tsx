"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { billKey, kindNames, managementFields, managementKeys, parseNumber, scopeNames, validateBill, type Bill, type Residence } from "./model";

export function BillEditor({bill,originalKey,bills,residence,onSave,onClose}:{bill:Bill;originalKey?:string;bills:Bill[];residence:Residence;onSave:(bill:Bill)=>void;onClose:()=>void}) {
  const [errors,setErrors] = useState<string[]>([]);
  return <dialog ref={node=>{if (node && !node.open) node.showModal();}} onCancel={onClose} aria-labelledby="utility-editor" className="dialog utility-dialog">
    <form onSubmit={event=>{
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const get = (key:string)=>String(fields.get(key) ?? "").trim();
      const next:Bill = {...bill,month:get("month"),scope:get("scope")==="personal" ? "personal" : "reference",note:get("note")};
      const issues:string[] = [];
      if (next.kind==="management") {
        for (const key of managementKeys) {
          const {label,unit} = managementFields[key];
          try { next[key] = parseNumber(get(key),unit,key==="sharedElectricity"); }
          catch (error) { issues.push(label+" · "+(error as Error).message); }
        }
      } else {
        try { next.gas = parseNumber(get("gas"),"원"); }
        catch (error) { issues.push("가스요금 · "+(error as Error).message); }
        next.start = get("start") || null;
        next.end = get("end") || null;
      }
      if (bills.some(item=>billKey(item)!==originalKey && billKey(item)===billKey(next))) issues.push("해당 청구월에 같은 종류가 이미 등록되어 있습니다. 목록에서 수정해 주세요.");
      issues.push(...validateBill(next,residence));
      if (issues.length) setErrors(issues);
      else onSave(next);
    }}>
      <h2 id="utility-editor">{kindNames[bill.kind]} {originalKey ? "수정" : "등록"}</h2>
      <div className="utility-fields">
        <label>청구월<input type="month" name="month" defaultValue={bill.month} required/></label>
        <label>사용 구분<select name="scope" defaultValue={bill.scope}>{Object.entries(scopeNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {bill.kind==="management" ? managementKeys.map(key=><label key={key}>{managementFields[key].label} ({managementFields[key].unit})
          <input name={key} inputMode="decimal" defaultValue={bill[key] ?? ""}/></label>) : <>
          <label>가스요금 (원)<input name="gas" inputMode="decimal" defaultValue={bill.gas ?? ""}/></label>
          <label>가스비 사용 시작일<input name="start" type="date" defaultValue={bill.start ?? ""}/></label>
          <label>가스비 사용 종료일<input name="end" type="date" defaultValue={bill.end ?? ""}/></label>
        </>}
      </div>
      <p className="muted">미청구 또는 미확인 값은 비워 두세요. 본인 사용 내역은 거주 기간 안의 청구만 등록할 수 있습니다.</p>
      <label>비고<textarea name="note" defaultValue={bill.note} maxLength={1000}/></label>
      {!!errors.length && <ul role="alert" className="utility-errors">{errors.map(error=><li key={error}>{error}</li>)}</ul>}
      <div className="row-actions"><Button type="button" variant="outline" onClick={onClose}>취소</Button><Button type="submit">저장</Button></div>
    </form>
  </dialog>;
}
