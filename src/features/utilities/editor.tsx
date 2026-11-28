"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  billKey, kindNames, managementFields, managementKeys, needsResidenceConfirmation, parseNumber, replaceBills, residenceWarnings, scopeNames, validateBill,
  type Bill, type GasBill, type Residence, type Scope,
} from "./model";

export function BillEditor({bill,originalKey,bills,residence,onSave,onClose}:{
  bill:Bill;originalKey?:string;bills:Bill[];residence:Residence;onSave:(changes:Bill[],confirmed:boolean)=>void;onClose:()=>void;
}) {
  const [errors,setErrors] = useState<string[]>([]);
  const [warnings,setWarnings] = useState<string[]>([]);
  const [confirmed,setConfirmed] = useState(false);
  const [month,setMonth] = useState(bill.month);
  const [scope,setScope] = useState(bill.scope);
  const [television,setTelevision] = useState<string|null>(null);
  const linkedGas = bill.kind==="management" ? bills.find((item):item is GasBill=>item.kind==="gas" && item.month===month && item.scope===scope) : undefined;
  function resetConfirmation() {
    setConfirmed(false);
    setWarnings([]);
  }

  return <dialog ref={node=>{if (node && !node.open) node.showModal();}} onCancel={onClose} aria-labelledby="utility-editor" className="dialog utility-dialog">
    <form onSubmit={event=>{
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const get = (key:string)=>String(fields.get(key) ?? "").trim();
      const next:Bill = {...bill,month,scope,note:get("note")};
      const issues:string[] = [];
      const changes = [next];
      function readGas(gas:GasBill) {
        try {gas.gas = parseNumber(get("gas"),"원");}
        catch (error) {issues.push("가스요금 · "+(error as Error).message);}
        gas.start = get("start") || null;
        gas.end = get("end") || null;
      }
      if (next.kind==="management") {
        for (const key of managementKeys) {
          const {label,unit} = managementFields[key];
          try { next[key] = parseNumber(get(key),unit,key==="sharedElectricity"); }
          catch (error) { issues.push(label+" · "+(error as Error).message); }
        }
        const gas:GasBill = {kind:"gas",month,scope,gas:null,start:null,end:null,note:linkedGas?.note ?? ""};
        readGas(gas);
        if (linkedGas ? gas.gas!==linkedGas.gas || gas.start!==linkedGas.start || gas.end!==linkedGas.end
          : gas.gas!==null || gas.start!==null || gas.end!==null) changes.push(gas);
      } else readGas(next);

      if (bills.some(item=>billKey(item)!==originalKey && billKey(item)===billKey(next))) {
        issues.push("청구월·청구 종류·데이터 유형이 같은 내역이 있습니다. 목록에서 수정해 주세요.");
      }
      issues.push(...changes.flatMap(validateBill));
      setErrors(issues);
      if (issues.length) return;
      const updated = replaceBills(bills.filter(item=>billKey(item)!==originalKey),changes);
      if (!confirmed && needsResidenceConfirmation({bills,residence},{bills:updated,residence})) {
        setWarnings([...new Set(changes.flatMap(item=>residenceWarnings(item,residence)))]);
        return;
      }
      onSave(changes,confirmed);
    }}>
      <h2 id="utility-editor">{kindNames[bill.kind]} {originalKey ? "수정" : "등록"}</h2>
      <div className="utility-fields" onChange={resetConfirmation}>
        <label>청구월<input type="month" name="month" value={month} onChange={event=>setMonth(event.target.value)} required/></label>
        <label>데이터 유형<select name="scope" value={scope} onChange={event=>setScope(event.target.value as Scope)}>{Object.entries(scopeNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {bill.kind==="management" && managementKeys.map(key=><label key={key}>{managementFields[key].label} ({managementFields[key].unit})
          {key==="television" && !originalKey
            ? <input name={key} inputMode="decimal" value={television ?? (scope==="personal" ? "2500" : "")} onChange={event=>setTelevision(event.target.value)}/>
            : <input name={key} inputMode="decimal" defaultValue={bill[key] ?? ""}/>}
        </label>)}
      </div>
      <fieldset key={bill.kind==="gas" ? "gas" : month+scope} className="utility-fields utility-gas-fields" onChange={resetConfirmation}>
        {bill.kind==="management" && <legend>같은 청구월·데이터 유형의 가스비 (선택)</legend>}
        <label>가스요금 (원)<input name="gas" inputMode="decimal" defaultValue={(bill.kind==="gas" ? bill.gas : linkedGas?.gas) ?? ""}/></label>
        <label>가스비 사용 시작일<input name="start" type="date" defaultValue={(bill.kind==="gas" ? bill.start : linkedGas?.start) ?? ""}/></label>
        <label>가스비 사용 종료일<input name="end" type="date" defaultValue={(bill.kind==="gas" ? bill.end : linkedGas?.end) ?? ""}/></label>
      </fieldset>
      <p className="muted">미청구 또는 미확인 값은 비워 두세요. 거주 기간과 겹치지 않는 실제 관리비는 확인 후 저장할 수 있습니다.</p>
      <label>비고<textarea name="note" defaultValue={bill.note} maxLength={1000} onChange={resetConfirmation}/></label>
      {!!errors.length && <ul role="alert" className="utility-errors">{errors.map(error=><li key={error}>{error}</li>)}</ul>}
      {!!warnings.length && <>
        <p role="alert" className="utility-errors">{warnings.join(" ")}</p>
        <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>거주 기간과 겹치지 않는 청구를 실제 관리비로 저장합니다.</label>
      </>}
      <div className="row-actions"><Button type="button" variant="outline" onClick={onClose}>취소</Button><Button type="submit" disabled={warnings.length>0 && !confirmed}>저장</Button></div>
    </form>
  </dialog>;
}
