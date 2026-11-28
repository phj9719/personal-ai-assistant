import {z} from "zod";
import {date,entityId,id,list,name,text,unique,won} from "../shared/data.ts";

export const statuses={active:"이용 중",trial:"무료 체험",paused:"일시 중지",cancel:"해지 예정",ended:"종료"} as const;
export const units={day:"일",week:"주",month:"월",year:"연"} as const;
export const currencies=["KRW","USD","EUR","JPY"] as const;
type Currency=typeof currencies[number];
const price=z.number().min(0).max(999999999).refine(value=>Math.abs(value*100-Math.round(value*100))<0.0001);
const rate=z.number().positive().max(1000000).nullable();
const url=text.refine(value=>{
  if (!value) return true;
  try {const parsed=new URL(value);return ["https:","http:"].includes(parsed.protocol) && !parsed.username && !parsed.password;} catch {return false;}
});
export const subscriptionSchema=z.strictObject({
  id:entityId,title:name,category:text,plan:text,vendor:text,amount:price,currency:z.enum(currencies),rate,
  unit:z.enum(["day","week","month","year"]),interval:z.number().int().min(1).max(365),anchor:date,start:date.nullable(),
  next:date.nullable(),end:date.nullable(),accountId:id.nullable(),ruleId:id.nullable(),
  website:url,manage:url,renew:z.boolean(),status:z.enum(["active","trial","paused","cancel","ended"]),
  trialEnd:date.nullable(),reminders:z.array(z.number().int().min(0).max(365)).max(20).refine(values=>unique(values,String)),note:text,
}).refine(row=>(!row.start || !row.end || row.start<=row.end) && (row.status!=="cancel" || row.end!==null) &&
  (row.status!=="trial" || row.trialEnd!==null),"시작·종료일, 해지 종료일 또는 체험 종료일을 확인해 주세요.");
export const paymentSchema=z.strictObject({
  id:entityId,serviceId:entityId,due:date,paidOn:date.nullable(),expected:price,amount:price.nullable(),currency:z.enum(currencies),
  expectedRate:rate,rate,actualCurrency:z.enum(currencies).nullable(),actualWon:won.nullable(),accountId:id.nullable(),plan:text,state:z.enum(["pending","paid","skipped"]),
  entryId:id.nullable(),fixedRuleId:id.nullable(),fixedMonth:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),posted:z.boolean(),note:text,
}).refine(row=>row.state==="paid" ? row.paidOn!==null && row.amount!==null :
  row.paidOn===null && row.amount===null && row.actualWon===null && row.actualCurrency===null && !row.posted && !row.entryId && !row.fixedMonth)
 .refine(row=>Number(row.posted)+Number(!!row.entryId)+Number(!!row.fixedMonth)<=1 && (!!row.fixedMonth===!!row.fixedRuleId) && (!row.posted || paidWon(row)!==null));
const changes=z.strictObject({id:entityId,serviceId:entityId,date,before:subscriptionSchema.nullable(),after:subscriptionSchema});
export const subscriptionsSchema=z.strictObject({
  categories:list,services:z.array(subscriptionSchema).max(1000),payments:z.array(paymentSchema).max(5000),changes:z.array(changes).max(5000),
}).refine(data=>{
  const ids=new Set(data.services.map(row=>row.id));
  return ids.size===data.services.length && unique(data.services,row=>row.title.trim().toLowerCase()+":"+row.anchor) && unique(data.payments,row=>row.id) && unique(data.payments,row=>row.serviceId+":"+row.due) &&
    unique(data.changes,row=>row.id) && data.payments.every(row=>ids.has(row.serviceId)) &&
    data.changes.every(row=>ids.has(row.serviceId) && row.after.id===row.serviceId && (!row.before || row.before.id===row.serviceId));
},"구독 참조 또는 결제 예정일이 중복되었습니다.");
export type Subscription=z.infer<typeof subscriptionSchema>;
export type Payment=z.infer<typeof paymentSchema>;
export type Subscriptions=z.infer<typeof subscriptionsSchema>;
export const initialSubscriptions:Subscriptions={categories:["AI 서비스","OTT","음악","클라우드","소프트웨어","게임","쇼핑 멤버십","교육","생활","기타"],services:[],payments:[],changes:[]};

const dayMs=86400000;
const ms=(day:string)=>Date.parse(day+"T00:00:00Z");
export const moveDays=(day:string,count:number)=>new Date(ms(day)+count*dayMs).toISOString().slice(0,10);
export function occurrence(anchor:string,unit:Subscription["unit"],interval:number,index:number) {
  if (unit==="day" || unit==="week") {
    const day=new Date(ms(anchor)+dayMs*index*interval*(unit==="week" ? 7 : 1));
    return !Number.isFinite(day.getTime()) || day.getUTCFullYear()>9999 ? "~" : day.toISOString().slice(0,10);
  }
  const [y,m,d]=anchor.split("-").map(Number);
  const offset=index*interval*(unit==="year" ? 12 : 1);
  const last=new Date(Date.UTC(y,m+offset,0)).getUTCDate();
  const day=new Date(Date.UTC(y,m-1+offset,Math.min(d,last)));
  return !Number.isFinite(day.getTime()) || day.getUTCFullYear()>9999 ? "~" : day.toISOString().slice(0,10);
}
export const convert=(amount:number,currency:Currency,rate:number|null)=>currency==="KRW" ? Math.round(amount) : rate===null ? null : Math.round(amount*rate);
export function paidWon(row:{amount:number|null;actualWon:number|null;currency:Currency;actualCurrency:Currency|null;rate:number|null}):number|null {
  return row.actualWon ?? (row.amount===null ? null : convert(row.amount,row.actualCurrency ?? row.currency,row.rate));
}
export const available=(row:Subscription,day:string)=>row.status!=="paused" && row.status!=="ended" && (row.status!=="trial" || row.renew || !row.trialEnd || row.trialEnd>=day) && (!row.start || row.start<=day) && (!row.end || row.end>=day);
export function dueDates(row:Subscription,from:string,to:string) {
  if (row.status==="paused" || row.status==="ended" || (row.status==="trial" && !row.renew)) return [];
  const first=[from,row.anchor,row.start ?? "",row.trialEnd ?? ""].sort().at(-1)!;
  const last=row.end && row.end<to ? row.end : to;
  const estimate=(ms(first)-ms(row.anchor))/dayMs;
  const lower=itemLowerBound(row.unit,row.interval,estimate);
  let index=Math.max(0,Math.floor(lower)-2);
  const result:string[]=[];
  while (first<=last && index<4000000) {
    const value=occurrence(row.anchor,row.unit,row.interval,index++);
    if (value>last) break;
    if (value>=first) result.push(value);
  }
  if (row.next) {
    const days=(ms(row.next)-ms(row.anchor))/dayMs;
    let cursor=Math.max(0,Math.floor(itemLowerBound(row.unit,row.interval,days))-2);
    let previous=occurrence(row.anchor,row.unit,row.interval,cursor);
    let current=previous;
    while (current<row.next && cursor<4000000) {
      previous=current;
      current=occurrence(row.anchor,row.unit,row.interval,++cursor);
    }
    const replaced=current==="~" || Math.abs(ms(previous)-ms(row.next))<=Math.abs(ms(current)-ms(row.next)) ? previous : current;
    if (result.includes(replaced)) result.splice(result.indexOf(replaced),1);
    if (row.next>=from && (!row.start || row.next>=row.start) && (!row.trialEnd || row.next>=row.trialEnd) && row.next<=last) result.push(row.next);
  }
  return [...new Set(result)].sort();
}
function itemLowerBound(unit:Subscription["unit"],interval:number,days:number) {
  return days/(interval*({day:1,week:7,month:31,year:366}[unit]));
}

export function forecasts(data:Subscriptions,from:string,to:string) {
  const existing=new Map(data.payments.map(row=>[row.serviceId+":"+row.due,row]));
  return data.services.flatMap(service=>dueDates(service,from,to).map(due=>({
    id:service.id+":"+due,service,due,amount:convert(service.amount,service.currency,service.rate),
    payment:existing.get(service.id+":"+due),
  }))).map(item=>item.payment ? {...item,amount:convert(item.payment.expected,item.payment.currency,item.payment.expectedRate)} : item).sort((a,b)=>a.due.localeCompare(b.due));
}

export function newPayment(service:Subscription,due:string,id:string):Payment {
  return {id,serviceId:service.id,due,paidOn:null,expected:service.amount,amount:null,currency:service.currency,expectedRate:service.rate,rate:null,actualCurrency:null,
    actualWon:null,accountId:service.accountId,plan:service.plan,state:"pending",entryId:null,fixedRuleId:null,fixedMonth:null,posted:false,note:""};
}

export function yearly(row:Subscription) {
  const amount=convert(row.amount,row.currency,row.rate);
  return amount===null ? null : amount*({day:365,week:365/7,month:12,year:1}[row.unit])/row.interval;
}
export function amounts(values:(number|null)[]) {
  return {total:values.reduce<number>((sum,value)=>sum+(value ?? 0),0),unknown:values.filter(value=>value===null).length};
}
export function postedExpenses(data:Subscriptions,month:string) {
  return data.payments.filter(row=>row.posted && row.state==="paid" && row.paidOn?.startsWith(month))
    .map(row=>({row,amount:paidWon(row)!}));
}

export function subscriptionEvents(data:Subscriptions,today:string) {
  const end=moveDays(today,365);
  const upcoming=forecasts(data,today,end).filter(row=>!row.payment || row.payment.state==="pending");
  const events=upcoming.map(row=>({id:"subscription-pay:"+row.id,date:row.due,title:(row.service.renew ? "구독 갱신 · " : "구독 결제 · ")+row.service.title,reminders:row.service.reminders}));
  for (const row of data.services.filter(row=>row.status!=="ended")) {
    for (const [key,date,title] of [["trial",row.trialEnd,"무료 체험 종료"],["end",row.end,row.status==="cancel" ? "구독 해지" : "구독 만료"]] as const) {
      if (date && date>=today && date<=end) events.push({id:"subscription-"+key+":"+row.id,date,title:title+" · "+row.title,reminders:row.reminders});
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date));
}
