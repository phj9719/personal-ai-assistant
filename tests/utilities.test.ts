import assert from "node:assert/strict";
import test from "node:test";
import {
  blankBill, change, comparison, housing, managementBreakdown, metrics, monthlyBills, needsResidenceConfirmation,
  parseNumber, personalStatistics, replaceBills, residenceWarnings, selectBills, yearComparison,
  validateBill, type Bill, type ManagementBill,
} from "../src/features/utilities/model.ts";
import {exportBills, importBills} from "../src/features/utilities/import.ts";

const residence = {start:"2026-02-09",end:"2026-08-20"};
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

test("allows move-in, move-out, and partially overlapping gas periods without repricing",()=>{
  for (const month of ["2026-02","2026-03","2026-08"]) {
    const bill = management(month,15000);
    assert.deepEqual(residenceWarnings(bill,residence),[]);
    assert.deepEqual(validateBill(bill),[]);
  }
  const gas:Bill = {kind:"gas",month:"2026-02",scope:"personal",gas:100,start:"2026-01-10",end:"2026-02-09",note:""};
  assert.deepEqual(residenceWarnings(gas,residence),[]);
  assert.equal(residenceWarnings({...gas,end:"2026-02-08"},residence).length,1);
  assert.ok(validateBill({...gas,scope:"reference",start:"2026-04-31"}).length);
  assert.ok(validateBill({...gas,start:"2026-02-19"}).length);
  assert.deepEqual(residenceWarnings(management("2025-04",100,"reference"),residence),[]);
});

test("requires acknowledgement only for changed actual bills outside residence and honors saved scopes",()=>{
  const first = management("2025-04",15000);
  const reference = {...first,scope:"reference" as const,total:16000};
  const old = {residence,bills:[first,reference]};
  assert.equal(needsResidenceConfirmation(undefined,old),true);
  assert.equal(needsResidenceConfirmation(old,{...old,residence:{...residence,end:null}}),false);
  assert.equal(needsResidenceConfirmation(old,{...old,bills:[{...first,parking:100},reference]}),true);
  assert.equal(needsResidenceConfirmation(old,{...old,bills:[reference]}),false);
  assert.deepEqual(personalStatistics(old.bills),{total:15000,average:15000,months:1});
  assert.deepEqual(comparison(old.bills,"2025-04",true),{total:15000,complete:false,scope:"personal"});
  assert.deepEqual(comparison([reference],"2025-04",true),{total:16000,complete:false,scope:"reference"});
  assert.equal(comparison([reference],"2025-04",false).total,null);
  assert.equal(comparison(old.bills,"2025-03",true).total,null);
  assert.equal(replaceBills(old.bills,[{...reference,total:9000}]).length,2);
});

test("keeps parking informational and uses invoice totals regardless of the old flag",()=>{
  const bill = {...management("2026-02",75000),electricity:8000,sharedElectricity:-500,water:5000,base:60000};
  const gas:Bill = {kind:"gas",month:bill.month,scope:"personal",gas:15000,start:null,end:null,note:""};
  for (const parking of [0,5000,null,undefined]) {
    const row = {...bill,parking};
    assert.deepEqual(managementBreakdown(row),{subtotal:75000,complete:true,difference:0});
    const legacy = {...row,parkingInBase:true};
    assert.deepEqual(managementBreakdown(legacy),managementBreakdown(row));
    const values = metrics([legacy,gas]);
    assert.equal(values.parking,parking ?? null);
    assert.equal(values.total,75000);
    assert.equal(values.housing,90000);
    assert.deepEqual(personalStatistics([legacy,gas]),{total:90000,average:90000,months:1});
  }
  assert.equal(needsResidenceConfirmation({bills:[bill],residence},{bills:[{...bill,parking:0}],residence}),false);
  assert.equal(metrics([bill]).housing,null);
});

test("compares the matching prior month, prefers actual records, and counts only paired months for annual totals",()=>{
  const bills = [
    {...management("2026-02",75000),parking:null,electricityUsage:80},
    {...management("2025-02",65000),parking:4000,electricityUsage:100},
    {...management("2025-02",90000,"reference"),parking:5000},
    {...management("2026-03",87000),parking:0},
    {...management("2025-03",70000,"reference"),parking:0},
    {...management("2026-04",95000),parking:0},
    {...management("2025-05",88000,"reference"),parking:0},
  ];
  const index = monthlyBills(bills);
  const selected = metrics(selectBills(index.get("2025-02")!,"all"));
  assert.equal(selected.electricityUsage,100);
  assert.deepEqual(change(80,selected.electricityUsage),{difference:-20,rate:-20});
  assert.deepEqual(change(5,0),{difference:5,rate:null});
  assert.deepEqual(change(0,null),{difference:null,rate:null});
  assert.equal(change(7.2,6.1).difference,1.1);
  assert.deepEqual(yearComparison(index,"2026","all","total").filter(row=>row.current!==null && row.previous!==null),[
    {month:"02월",current:75000,previous:65000},{month:"03월",current:87000,previous:70000},
  ]);
  assert.deepEqual(yearComparison(index,"2026","all","parking")[1],{month:"02월",current:null,previous:4000});
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
  assert.equal(invalid[0].errors.length,1);
  const withParking = importBills("청구월,데이터 유형,주차비,관리비 고지서 합계,기본 관리비에 주차비 포함,가스비 사용 기간\n2025-04,참고용 관리비,0,12000,이전 양식,2025-03-01 ~ 2025-04-01",[],residence);
  const [invoice,gas] = withParking.map(row=>row.bill);
  assert.equal(invoice?.kind==="management" && invoice.parking,0);
  assert.equal(invoice?.kind==="management" && invoice.total,12000);
  assert.deepEqual(withParking.map(row=>row.errors),[[],[]]);
  assert.doesNotMatch(exportBills(withParking.map(row=>row.bill!)),/기본 관리비에 주차비 포함/);
  assert.equal(gas?.kind==="gas" && gas.start,"2025-03-01");
  assert.equal(withParking[1].warnings.length,0);
  const bulk = importBills("청구월,사용 구분,주차비,관리비 합계\n2025-04,참고용 내역,,12000",[],residence,"personal");
  assert.equal(bulk[0].warnings.length,1);
  assert.equal(bulk[0].bill?.kind==="management" && bulk[0].bill.parking,null);
  assert.equal(bulk[0].errors.length,0);
  const legacy = "청구월,관리비 합계\n2026-04,15000";
  const retained = importBills(legacy,[{...original,parking:2000}],residence);
  assert.equal(retained[0].bill?.kind==="management" && retained[0].bill.parking,2000);
  assert.ok(importBills(legacy,[original,{...original,scope:"reference"}],residence)[0].errors.length);
  assert.equal(importBills(legacy,[original],residence,"reference")[0].duplicate,false);
});
