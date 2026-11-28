import {z} from "zod";
import {byDate,date,frequency,entityId,list,name,text,time,unique,won} from "../shared/data.ts";
import type {Records} from "../modules";
import {gameName,type Baseball} from "../baseball/model.ts";

export const activitySchema=z.strictObject({
  id:entityId,date,title:name,category:text,start:time.nullable(),end:time.nullable(),minutes:z.number().int().min(0).max(1440).nullable(),
  place:text,people:list,mood:text,tags:list,note:text,
}).refine(row=>!row.start || !row.end || row.start<=row.end,"종료 시간이 시작 시간보다 빠릅니다.");
export const groupSchema=z.strictObject({id:entityId,title:name,description:text,active:z.boolean(),members:list,order:list,next:text,note:text});
export const purchaseSchema=z.strictObject({
  id:entityId,groupId:entityId,date,time:time.nullable(),payer:name,kind:z.enum(["self","other","reward"]),
  place:text,detail:text,amount:won.nullable(),people:list,session:text,round:text,note:text,participates:z.boolean(),
});
export const lifeSchema=z.strictObject({
  categories:list,activities:z.array(activitySchema).max(5000),groups:z.array(groupSchema).max(500),purchases:z.array(purchaseSchema).max(5000),
}).refine(data=>unique(data.activities,row=>row.id) && unique(data.groups,row=>row.id) && unique(data.purchases,row=>row.id)
 && data.purchases.every(row=>data.groups.some(group=>group.id===row.groupId)));
export type Activity=z.infer<typeof activitySchema>;
export type Group=z.infer<typeof groupSchema>;
export type Purchase=z.infer<typeof purchaseSchema>;
export type Life=z.infer<typeof lifeSchema>;
export const initialLife:Life={categories:["식사","카페","운동","외출","쇼핑","여가","여행","건강","집안일","모임","취미","기타"],activities:[],groups:[],purchases:[]};

export function duration(row:Activity) {
  if (!row.start || !row.end) return row.minutes;
  const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
  return minute(row.end)-minute(row.start);
}

export function turn(group:Group,purchases:Purchase[]) {
  const rows=purchases.filter(row=>row.groupId===group.id).sort(byDate);
  const last=rows.at(-1);
  const participant=rows.findLast(row=>row.participates && row.kind!=="reward" && group.order.includes(row.payer));
  const next=group.next || (group.order.length ? group.order[(participant ? group.order.indexOf(participant.payer)+1 : 0)%group.order.length] : "");
  return {last,participant,next,count:rows.length};
}

export function rotationStats(rows:Purchase[]) {
  const known=rows.flatMap(row=>row.amount===null ? [] : [row.amount]);
  const self=rows.filter(row=>row.kind==="self");
  return {
    purchases:rows.length,meetings:new Set(rows.map(row=>row.session ? row.groupId+"|"+row.date+"|"+row.session : row.id)).size,
    self:self.length,selfAmount:self.reduce((sum,row)=>sum+(row.amount ?? 0),0),
    other:rows.filter(row=>row.kind==="other").length,reward:rows.filter(row=>row.kind==="reward").length,
    unknown:rows.length-known.length,average:known.length ? Math.round(known.reduce((a,b)=>a+b,0)/known.length) : null,
  };
}
export function activityStats(rows:Activity[]) {
  const latest=new Map<string,{date:string;minutes:number[]}>();
  for (const row of rows) {
    const current=latest.get(row.title) ?? {date:"",minutes:[]};
    if (row.date>current.date) current.date=row.date;
    const minutes=duration(row);
    if (minutes!==null) current.minutes.push(minutes);
    latest.set(row.title,current);
  }
  return {latest,places:frequency(rows,row=>row.place),people:frequency(rows.flatMap(row=>row.people),row=>row),
    hours:frequency(rows,row=>row.start?.slice(0,2) ?? ""),titles:frequency(rows,row=>row.title)};
}

export function timeline(life:Life,records:Records,baseball:Baseball) {
  const labels=new Map(life.groups.map(group=>[group.id,group.title]));
  return [
    ...life.activities.map(row=>({id:"life:"+row.id,date:row.date,time:row.start,title:row.title,source:row.category || "일상",detail:[row.place,...row.people,...row.tags,row.note].filter(Boolean).join(" · ")})),
    ...life.purchases.map(row=>({id:"purchase:"+row.id,date:row.date,time:row.time,title:(labels.get(row.groupId) ?? "결제 그룹")+" · "+row.payer,source:"돌아가며 결제",detail:[row.place,row.detail,row.note].filter(Boolean).join(" · ")})),
    ...records.schedule.filter(row=>row.completed).map(row=>({id:"schedule:"+row.id,date:row.completedOn ?? row.date,time:null,title:row.title,source:"완료 일정",detail:row.detail})),
    ...records.tasks.filter(row=>row.group==="완료").map(row=>({id:"task:"+row.id,date:row.completedOn ?? row.date,time:null,title:row.title,source:"완료 할 일",detail:row.detail})),
    ...records.learning.filter(row=>row.group==="학습 기록").map(row=>({id:"learning:"+row.id,date:row.date,time:null,title:row.title,source:"학습 기록",detail:row.detail})),
    ...baseball.games.filter(row=>row.visit==="yes").map(row=>({id:"baseball:"+row.id,date:row.date,time:row.time || null,title:gameName(row),source:"야구 직관",detail:row.note})),
  ].sort(byDate);
}
