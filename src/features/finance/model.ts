import { effectiveScope, validDate, validMonth, type UtilityState } from "../utilities/model.ts";

export const purposes = { consumption:"일반 소비", savings:"저축", investment:"투자" } as const;
export const methods = { transfer:"직접이체", debit:"자동출금", card:"카드결제" } as const;
export const modes = { fixed:"정액형", variable:"변동형", daily:"일할계산형" } as const;
export const links = { management:"관리비", gas:"도시가스" } as const;
export const schedules = { exact:"정확한 날짜", approximate:"대략적인 날짜", unspecified:"미지정" } as const;

export type Purpose = keyof typeof purposes;
export type Method = keyof typeof methods;
export type Quote = {mode:keyof typeof modes; amount:number|null; min:number|null; max:number|null};
export type Account = {id:string; name:string; institution:string; kind:"bank"|"card"; archived?:boolean};
export type Payment = {accountId:string|null;method:Method};
export type Rule = {
  id:string; title:string; purpose:Purpose; payment:Payment; quote:Quote;
  timing:keyof typeof schedules; day:number|null; start:string; end:string|null;
  active:boolean; archived?:boolean; utility:keyof typeof links|null;
};
export type Monthly = {
  ruleId:string; month:string; title:string; purpose:Purpose; payment:Payment; quote:Quote;
  timing:Rule["timing"]; due:string|null; utility:Rule["utility"];
  periodStart:string; periodEnd:string; paidOn:string|null; paidAmount:number|null;
};
export type Transfer = {id:string; title:string; date:string; amount:number; purpose:"savings"|"investment"; payment:Payment};
export type FinanceState = {accounts:Account[]; rules:Rule[]; monthly:Monthly[]; transfers:Transfer[]};

export function initialFinance(today:string): FinanceState {
  return {
    accounts:[{id:"sample-bank",name:"예시 생활비 계좌",institution:"가상 은행",kind:"bank"}],
    rules:[{id:"sample-internet",title:"예시 인터넷 요금",purpose:"consumption",
      payment:{accountId:"sample-bank",method:"debit"},quote:{mode:"fixed",amount:29000,min:null,max:null},
      timing:"approximate",day:20,start:today.slice(0,7)+"-01",end:null,active:true,utility:null}],
    monthly:[],transfers:[],
  };
}

const cents = (amount:number) => Math.round(amount*100);
const add = (values:number[]) => values.reduce((sum,amount)=>sum+cents(amount),0)/100;
const dayMs = 86400000;
function monthEnd(month:string) {
  const [year,part] = month.split("-").map(Number);
  return month+"-"+new Date(Date.UTC(year,part,0)).getUTCDate();
}

export function expected(record:Monthly) {
  const quote = record.quote;
  if (quote.mode !== "daily") return {amount:quote.amount,min:quote.min,max:quote.max};
  const days = (Date.parse(record.periodEnd)-Date.parse(record.periodStart))/dayMs+1;
  return {amount:quote.amount===null ? null : cents(quote.amount)*days/100,min:null,max:null};
}

export function createMonth(rules:Rule[], rows:Monthly[], month:string) {
  if (!validMonth(month)) return rows;
  const first = month+"-01";
  const last = monthEnd(month);
  const existing = new Set(rows.filter(row=>row.month===month).map(row=>row.ruleId));
  const utilities = new Set(rows.filter(row=>row.month===month && row.utility).map(row=>row.utility));
  const created:Monthly[] = [];
  for (const rule of rules) {
    if (!rule.active || rule.archived || rule.start>last || (rule.end && rule.end<first) ||
      existing.has(rule.id) || (rule.utility && utilities.has(rule.utility))) continue;
    const periodStart = rule.start>first ? rule.start : first;
    const periodEnd = rule.end && rule.end<last ? rule.end : last;
    const scheduled = rule.day===null || rule.timing==="unspecified" ? null :
      month+"-"+String(Math.min(rule.day,Number(last.slice(8)))).padStart(2,"0");
    const due = scheduled===null ? null : scheduled<periodStart ? periodStart : scheduled>periodEnd ? periodEnd : scheduled;
    created.push({ruleId:rule.id,month,title:rule.title,purpose:rule.purpose,payment:{...rule.payment},quote:{...rule.quote},
      timing:rule.timing,due,utility:rule.utility,periodStart,periodEnd,paidOn:null,paidAmount:null});
    existing.add(rule.id);
    if (rule.utility) utilities.add(rule.utility);
  }
  return [...rows,...created];
}

export function invoice(row:Monthly, utility:UtilityState) {
  if (!row.utility) return null;
  const bill = utility.bills.find(bill=>bill.kind===row.utility && bill.month===row.month && effectiveScope(bill,utility.residence)==="personal");
  return bill ? (bill.kind==="gas" ? bill.gas : bill.total) : null;
}

export function outstanding(row:Monthly, utility:UtilityState) {
  if (row.paidOn!==null) return {amount:0,min:null,max:null};
  const charge = invoice(row,utility);
  return charge===null ? expected(row) : {amount:charge,min:null,max:null};
}

export function validateRule(rule:Rule, rules:Rule[]) {
  if (!rule.title.trim() || !validDate(rule.start) || (rule.end && (!validDate(rule.end) || rule.end<rule.start))) {
    return "이름과 적용 시작일·종료일을 확인해 주세요.";
  }
  if (rule.timing!=="unspecified" && (rule.day===null || !Number.isInteger(rule.day) || rule.day<1 || rule.day>31)) {
    return "납부 예정일은 1~31일로 입력해 주세요.";
  }
  const {mode,amount,min,max} = rule.quote;
  if (amount===null && (mode!=="variable" || (!rule.utility && min===null))) return "금액 또는 최소·최대 범위를 입력해 주세요.";
  if (mode==="variable" && ((min===null)!==(max===null) || (min!==null && max!==null && (min>max || (amount!==null && (amount<min || amount>max)))))) {
    return "최소·최대 금액을 함께 입력하고 범위와 예상 금액을 확인해 주세요.";
  }
  if (rule.utility && rule.purpose!=="consumption") return "공과금은 일반 소비에만 연결할 수 있습니다.";
  if (rule.utility && rule.active && rules.some(item=>item.id!==rule.id && item.active && !item.archived && item.utility===rule.utility &&
    (!rule.end || item.start<=rule.end) && (!item.end || rule.start<=item.end))) return "같은 기간에 연결된 공과금 설정이 이미 있습니다.";
  return "";
}

export function estimateTotals(estimates:ReturnType<typeof expected>[]) {
  return {
    min:add(estimates.flatMap(item=>item.amount!==null ? [item.amount] : item.min!==null ? [item.min] : [])),
    max:add(estimates.flatMap(item=>item.amount!==null ? [item.amount] : item.max!==null ? [item.max] : [])),
    unknown:estimates.filter(item=>item.amount===null && item.min===null).length,
  };
}

export function financeStatistics(month:string, monthly:Monthly[], transfers:Transfer[], ledger:{group:string;amount:number;date:string}[], utility:UtilityState) {
  const rows = monthly.filter(row=>row.month===month);
  const records = ledger.filter(row=>row.date.startsWith(month));
  const planned = rows.map(expected);
  const remaining = rows.filter(row=>row.paidOn===null).map(row=>outstanding(row,utility));
  const paid = monthly.filter(row=>row.paidOn?.slice(0,7)===month && row.paidAmount!==null);
  const flow = (purpose:Purpose)=>add([
    ...paid.filter(row=>row.purpose===purpose).map(row=>row.paidAmount!),
    ...transfers.filter(row=>row.purpose===purpose && row.date.startsWith(month)).map(row=>row.amount),
    ...(purpose==="consumption" ? records.filter(row=>row.group==="지출").map(row=>row.amount) : []),
  ]);
  const consumption=flow("consumption"), savings=flow("savings"), investment=flow("investment");
  const income=add(records.filter(row=>row.group==="수입").map(row=>row.amount));
  const outflow=add([consumption,savings,investment]);
  return {planned:estimateTotals(planned),remaining:estimateTotals(remaining),paid:add(paid.map(row=>row.paidAmount!)),
    consumption,savings,investment,income,outflow,balance:add([income,-outflow])};
}

export function readPeriod(start:string,end:string) {
  if (!validDate(start) || !validDate(end) || start>end) return false;
  return (Date.parse(end)-Date.parse(start))/dayMs<366;
}
