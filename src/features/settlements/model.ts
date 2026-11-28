import type { Entry } from "../modules";
import { validDate } from "../utilities/model.ts";

export const paymentKinds = { transfer:"현금·계좌이체",card:"카드 승인" } as const;
export const repaymentKinds = { single:"일시 상환",regular:"정기 분할 상환",free:"비정기 자유 상환" } as const;
export const adjustmentKinds = { waive:"면제",assume:"본인 부담 전환" } as const;
export const roundingUnits = [1,10,100,500,1000,5000] as const;

export type Payment = {id:string;title:string;date:string;amount:number;method:keyof typeof paymentKinds;account:string;entryId:string|null};
export type Debit = Omit<Payment,"method">;
export type Person = {id:string;name:string;share:number};
export type Installment = {id:string;date:string|null;amount:number|null};
export type Receipt = {id:string;personId:string;date:string;amount:number;account:string;note:string;entryId:string|null;quick?:boolean};
export type Adjustment = {id:string;date:string;amount:number;kind:keyof typeof adjustmentKinds;note:string};
type Common = {id:string;title:string;date:string;note:string;payments:Payment[];debits:Debit[];own:number;receipts:Receipt[]};
export type Split = Common & {kind:"split";people:Person[];due:string|null};
export type Advance = Common & {
  kind:"advance";name:string;target:number|null;cardInstallments:number|null;
  repayment:keyof typeof repaymentKinds;start:string|null;end:string|null;planAmount:number|null;
  plans:Installment[];adjustments:Adjustment[];
};
export type Case = Split | Advance;
export type Settlements = Case[];

export const sum = (values:number[])=>values.reduce((total,value)=>total+value,0);
export const principal = (item:Case)=>sum(item.payments.map(row=>row.amount));
export const expected = (item:Case)=>item.kind==="split" ? sum(item.people.map(person=>person.share)) : item.target ?? principal(item)-item.own;
export const received = (item:Case,personId?:string)=>sum(item.receipts.filter(row=>!personId || row.personId===personId).map(row=>row.amount));
export const adjusted = (item:Case)=>item.kind==="advance" ? sum(item.adjustments.map(row=>row.amount)) : 0;
export const balance = (item:Case)=>expected(item)-received(item)-adjusted(item);
export const peopleOf = (item:Case):Person[]=>item.kind==="split" ? item.people : [{id:item.id,name:item.name,share:expected(item)}];
export const personBalance = (item:Case,person:Person)=>person.share-received(item,person.id)-adjusted(item);
export const paymentState = (paid:number,left:number)=>left===0 ? "입금 완료" : paid>0 ? "부분 입금" : "미입금";

export function repaymentProgress(item:Advance) {
  const total = expected(item);
  return total===0 ? 100 : Math.floor((total-balance(item))*1000/total)/10;
}

export function saveReceipt(item:Case,row:Receipt,editing:boolean) {
  const exists = item.receipts.some(receipt=>receipt.id===row.id);
  if (exists!==editing || (!editing && item.receipts.length>=500)) return null;
  return {...item,receipts:editing ? item.receipts.map(receipt=>receipt.id===row.id ? row : receipt) : [...item.receipts,row]};
}

export function equalShares(total:number, count:number, unit:number) {
  const share = Math.floor(total/(count+1)/unit)*unit;
  return {share,own:total-share*count};
}

export function installmentPlan(start:string,end:string|null,amount:number|null,target:number,ids:()=>string) {
  if (!validDate(start) || end!==null && (!validDate(end) || end<start) || (amount===null || amount===0) && !end) {
    throw new Error("정기 분할 생성을 위해 시작일과 종료일 또는 회차 금액을 입력해 주세요.");
  }
  const [year,month,day] = start.split("-").map(Number);
  let remaining = target;
  const plans:Installment[] = [];
  for (let offset=0;offset<600;offset++) {
    const last = new Date(Date.UTC(year,month+offset,0)).getUTCDate();
    const date = new Date(Date.UTC(year,month-1+offset,Math.min(day,last))).toISOString().slice(0,10);
    if ((end && date>end) || (amount!==null && amount>0 && remaining===0)) return plans;
    const value = amount===null ? null : Math.min(amount,remaining);
    plans.push({id:ids(),date,amount:value});
    remaining -= value ?? 0;
  }
  throw new Error("자동 생성 가능한 회차는 최대 600개입니다.");
}

export function openPlans(item:Case) {
  if (item.kind==="split") return item.people.map(person=>({date:item.due,amount:personBalance(item,person)}));
  let applied = received(item)+adjusted(item);
  return [...item.plans].sort((a,b)=>(a.date ?? "z").localeCompare(b.date ?? "z")).map(plan=>{
    if (plan.amount===null) return {date:plan.date,amount:balance(item)===0 ? 0 : null};
    const used = Math.min(applied,plan.amount);
    applied -= used;
    return {date:plan.date,amount:plan.amount-used};
  });
}

export function caseStatus(item:Case,today:string) {
  if (balance(item)===0) return item.kind==="split" ? "정산 완료" : "상환 완료";
  if (item.kind==="split") return "정산 중";
  const plans = openPlans(item);
  if (plans.some(plan=>plan.date && plan.date<today && (plan.amount ?? 0)>0) || (item.end && item.end<today)) return "연체";
  return plans.some(plan=>plan.date) || item.end ? "상환 중" : "예정일 미지정";
}

export function receivableStats(cases:Settlements,month:string,today:string) {
  const open = cases.flatMap(openPlans);
  const people = new Map<string,number>();
  for (const item of cases) for (const person of peopleOf(item)) {
    const amount = personBalance(item,person);
    if (amount>0) people.set(person.name,(people.get(person.name) ?? 0)+amount);
  }
  return {
    splits:sum(cases.filter(item=>item.kind==="split").map(expected)),
    advances:sum(cases.filter(item=>item.kind==="advance").map(principal)),
    received:sum(cases.map(item=>received(item))),
    balance:sum(cases.map(balance)),
    scheduled:sum(open.filter(row=>row.date?.startsWith(month)).map(row=>row.amount ?? 0)),
    unknownScheduled:open.filter(row=>row.date?.startsWith(month) && row.amount===null).length,
    monthlyReceived:sum(cases.flatMap(item=>item.receipts).filter(row=>row.date.startsWith(month)).map(row=>row.amount)),
    overdue:sum(cases.map(item=>item.kind==="advance" && item.end && item.end<today ? balance(item) :
      sum(openPlans(item).filter(row=>row.date && row.date<today).map(row=>row.amount ?? 0)))),
    completed:cases.filter(item=>balance(item)===0).length,
    active:cases.filter(item=>balance(item)>0).length,
    people:[...people].sort((a,b)=>b[1]-a[1]),
  };
}

export function linkedIds(cases:Settlements) {
  return new Set(cases.flatMap(item=>[...item.payments,...item.debits,...item.receipts]).flatMap(row=>row.entryId ? [row.entryId] : []));
}

export function linkedError(cases:Settlements,ledger:Entry[]) {
  const byId = new Map(ledger.map(row=>[row.id,row]));
  const used = new Set<string>();
  const links = cases.flatMap(item=>[
    ...[...item.payments,...item.debits].map(row=>({row,group:"지출"})),
    ...item.receipts.map(row=>({row,group:"수입"})),
  ]);
  for (const {row,group} of links) {
    if (!row.entryId) continue;
    const entry = byId.get(row.entryId);
    if (used.has(row.entryId)) return "하나의 거래는 한 결제·출금·입금에만 연결할 수 있습니다.";
    if (!entry || entry.group!==group || entry.amount!==row.amount || entry.date!==row.date) {
      return "연결된 거래의 금액·날짜·분류는 정산·대납에서 연결을 해제한 뒤 변경할 수 있습니다.";
    }
    used.add(row.entryId);
  }
  return "";
}

export function caseError(item:Case) {
  const total = principal(item);
  if (!item.payments.length || total<=0 || item.own>total) return "결제 원금과 본인 부담금을 확인해 주세요.";
  if (sum(item.debits.map(row=>row.amount))>sum(item.payments.filter(row=>row.method==="card").map(row=>row.amount))) {
    return "실제 카드 출금 합계가 카드 승인 합계를 초과합니다.";
  }
  const people = peopleOf(item);
  const ids = new Set(people.map(person=>person.id));
  if (people.some(person=>person.share<0 || personBalance(item,person)<0) || item.receipts.some(row=>!ids.has(row.personId))) {
    return "부담금을 초과하는 입금·조정이 있거나 입금 대상이 삭제되었습니다.";
  }
  if (item.kind==="split" && (!item.people.length || item.own+expected(item)!==total)) return "참석자와 본인 부담금 합계가 총 결제금액과 일치해야 합니다.";
  if (item.kind==="advance") {
    if (item.own+expected(item)!==total) return "본인 부담금과 돌려받을 금액의 합이 대납 원금과 일치해야 합니다.";
    if (item.start && item.end && item.start>item.end) return "상환 시작일은 종료 예정일보다 늦을 수 없습니다.";
    if (sum(item.plans.map(row=>row.amount ?? 0))>expected(item)) return "회차별 예정 금액이 전체 상환 예정액을 초과합니다.";
    if (item.plans.some(row=>row.date && (item.start && row.date<item.start || item.end && row.date>item.end))) return "회차별 날짜는 상환 기간 안에 있어야 합니다.";
    if (item.cardInstallments!==null && !item.payments.some(row=>row.method==="card")) return "카드 승인 건이 있어야 카드 할부를 지정할 수 있습니다.";
  }
  return "";
}

export function cashPayments(cases:Settlements,month:string) {
  return cases.flatMap(item=>[...item.payments.filter(row=>row.method!=="card"),...item.debits]).filter(row=>row.date.startsWith(month));
}

export function settlementFlows(cases:Settlements,month:string) {
  return {
    consumption:sum(cases.map(item=>(item.date.startsWith(month) ? item.own : 0)+
      (item.kind==="advance" ? sum(item.adjustments.filter(row=>row.date.startsWith(month)).map(row=>row.amount)) : 0))),
    outflow:sum(cashPayments(cases,month).map(row=>row.amount)),
    refunds:sum(cases.flatMap(item=>item.receipts).filter(row=>row.date.startsWith(month)).map(row=>row.amount)),
  };
}

const currency = new Intl.NumberFormat("ko-KR");
export const won = (amount:number)=>currency.format(amount)+"원";
export function shareText(item:Split) {
  return [item.title+" 정산 안내", "총 결제 "+won(principal(item))+" · 본인 부담 "+won(item.own),
    ...item.people.map(person=>person.name+" "+won(person.share)+" · 남은 금액 "+won(personBalance(item,person)))].join("\n");
}
