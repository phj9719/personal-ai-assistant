import assert from "node:assert/strict";
import test from "node:test";
import {
  blankBill, comparison, effectiveScope, housing, managementBreakdown, parseNumber, personalStatistics, replaceBills,
  validateBill, type Bill, type ManagementBill,
} from "../src/features/utilities/model.ts";
import {exportBills, importBills} from "../src/features/utilities/import.ts";

const residence = {start:"2026-03-15",end:"2026-08-20"};
function management(month:string,total:number|null,scope:"personal"|"reference"="personal"):ManagementBill {
  const bill = blankBill("management",month,scope);
  assert.equal(bill.kind,"management");
  return {...bill,total};
}

test("keeps blank and zero separate and parses signed amounts and water/electricity units",()=>{
  assert.equal(parseNumber("","원"),null);
  assert.equal(parseNumber("0","원"),0);
  assert.equal(parseNumber("−1,200원","원",true),-1200);
  assert.equal(parseNumber("1.25k","원"),1250);
  assert.equal(parseNumber("120 kWh","kWh"),120);
  assert.equal(parseNumber("7.125 ㎥","㎥"),7.125);
  assert.equal(parseNumber("3 t","㎥"),3);
  assert.throws(()=>parseNumber("-1","원"));
  assert.throws(()=>parseNumber("12,34","원"));
  assert.throws(()=>parseNumber("12.123","원"));
  assert.throws(()=>parseNumber("0.1234","㎥"));
});

test("calculates the gap against the invoice and marks partial amounts",()=>{
  const bill = {...management("2026-04",4400),sharedElectricity:-100,water:1000};
  assert.deepEqual(managementBreakdown(bill),{subtotal:3400,complete:false,difference:1000});
  assert.equal(bill.television,2500);
  assert.deepEqual(housing([bill]),{total:4400,complete:false});
  const gas:Bill = {kind:"gas",month:bill.month,scope:"personal",gas:0,start:null,end:null,note:""};
  assert.deepEqual(housing([bill,gas]),{total:4400,complete:true});
  assert.equal(replaceBills([bill],[gas]).length,2);
});

test("excludes unidentified, out-of-residence and reference bills from own totals",()=>{
  const bills = [management("2026-03",300),management("2026-04",0),management("2026-05",null),
    management("2026-06",15000,"reference"),management("2026-07",200),management("2026-08",500)];
  assert.deepEqual(personalStatistics(bills,residence),{total:200,average:100,months:2});
  assert.equal(effectiveScope(bills[3],{start:"2020-01-01",end:null}),"reference");
  assert.equal(comparison(bills,"2026-03",residence,false).total,null);
  assert.deepEqual(comparison(bills,"2026-03",residence,true),{total:300,complete:false,scope:"reference"});
  assert.equal(comparison(bills,"2025-03",residence,true).total,null);
  const gas:Bill = {kind:"gas",month:"2026-04",scope:"personal",gas:100,start:"2026-03-01",end:"2026-04-02",note:""};
  assert.equal(effectiveScope(gas,residence),"reference");
  assert.ok(validateBill(gas,residence).length);
  assert.ok(validateBill({...gas,scope:"reference",start:"2026-04-31"},residence).length);
});

test("previews spreadsheet, Markdown and CSV rows without treating past data as personal",()=>{
  const original = management("2026-04",12000);
  const rows = importBills("청구월\t관리비 합계\t전기 사용량\t공동 전기료\t가스요금\n2026-04\t13,000\t80 kWh\t-200\t0", [original],residence);
  assert.deepEqual(rows.map(row=>[row.bill?.kind,row.bill?.scope,row.duplicate,row.errors]),[
    ["management","personal",true,[]],["gas","reference",false,[]],
  ]);
  assert.equal(rows[0].bill?.kind==="management" && rows[0].bill.television,2500);
  assert.equal(rows[1].bill?.kind==="gas" && rows[1].bill.gas,0);
  const history = importBills("| 청구월 | 수도 사용량 (㎥) | 관리비 합계 |\n| --- | --- | --- |\n| 2025-04 | 7 t | 9k |",[],residence);
  assert.equal(history[0].bill?.scope,"reference");
  assert.equal(history[0].bill?.kind==="management" && history[0].bill.waterUsage,7);
  const bills = [{...original,note:"가상, \"예시\"\n둘째 줄"},...rows.slice(1).map(row=>row.bill!)];
  assert.deepEqual(importBills(exportBills(bills),[],residence).map(row=>row.bill),bills);
  const duplicate = importBills("청구월,구분,가스요금\n2026-04,가스비,0\n2026-04,가스비,100",[],residence);
  assert.ok(duplicate[1].errors.length);
  const invalid = importBills("청구월,구분,사용 구분,가스요금\n2026-03,가스비,본인 사용 내역,-1",[],residence);
  assert.equal(invalid[0].errors.length,2);
});
