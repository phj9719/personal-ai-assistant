"use client";

import {useState} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGrid from "@fullcalendar/react/daygrid";
import interaction from "@fullcalendar/react/interaction";
import ko from "@fullcalendar/react/locales/ko";
import classic from "@fullcalendar/react/themes/classic";
import {Button} from "@/components/ui/button";
import type {Save} from "@/components/workspace-data";
import type {Records} from "../modules";
import type {Baseball} from "../baseball/model";
import {tableDate} from "../shared/import";
import {byDate,frequency,split} from "../shared/data";
import {Breakdown,Cards,Editor,Input,Select,TableImport,download,field,num,options,wonText} from "../shared/panel";
import {activitySchema,activityStats,duration,groupSchema,purchaseSchema,rotationStats,timeline,turn,type Activity,type Group,type Life,type Purchase} from "./model";

const tabs=["일상 대시보드","일상 타임라인","일상 캘린더","돌아가며 결제 관리","일상 활동 통계","가져오기·내보내기"];
const payKinds={self:"나",other:"기타",reward:"적립 카드 등"};
const uuid=()=>crypto.randomUUID();
const replace=<T extends {id:string}>(rows:T[],row:T)=>rows.some(item=>item.id===row.id) ? rows.map(item=>item.id===row.id ? row : item) : [...rows,row];
const colors=["#5063a9","#226f61","#866029","#854973","#316887","#795252"];
export const lifeColor=(label:string)=>colors[[...label].reduce((a,b)=>a+b.charCodeAt(0),0)%colors.length];
const signature=(value:{id:string})=>JSON.stringify({...value,id:undefined});
const keyed=<T extends {id:string}>(existing:T[],values:T[])=>{
  const seen=new Set(existing.map(signature));
  return values.filter(value=>{const key=signature(value);if (seen.has(key)) return false;seen.add(key);return true;});
};

function activityFrom(raw:Record<string,string>,fallback:string):Activity {
  return {id:uuid(),date:raw["날짜"] ? tableDate(raw["날짜"]) : fallback,title:raw["제목"] || "",category:raw["분류"] || "",start:raw["시작"] || null,end:raw["종료"] || null,
    minutes:raw["분"] ? Number(raw["분"]) : null,place:raw["장소"] || "",people:split(raw["동행"] || ""),mood:raw["기분"] || "",
    tags:split(raw["태그"] || ""),note:raw["메모"] || ""};
}

function purchaseFrom(raw:Record<string,string>,groupId:string,today:string):Purchase {
  const kind=raw["유형"]==="적립" || raw["유형"]==="reward" ? "reward" : raw["결제자"]==="나" || raw["유형"]==="self" ? "self" : "other";
  return {id:uuid(),groupId,date:raw["날짜"] ? tableDate(raw["날짜"]) : today,time:raw["시간"] || null,payer:kind==="self" ? "나" : raw["결제자"] || "",kind,
    place:raw["장소"] || "",detail:raw["내용"] || "",amount:raw["금액"] ? Number(raw["금액"].replace(/[,\s원]/g,"")) : null,
    people:split(raw["동행"] || ""),session:raw["모임"] || "",round:raw["회차"] || "",note:raw["메모"] || "",participates:raw["순서 제외"]!=="예"};
}
const todayActivity=(today:string)=>activityFrom({"날짜":today},today);
type Mode={kind:"activity";row:Activity}|{kind:"group";row:Group}|{kind:"purchase";row:Purchase}|{kind:"categories"};

export function LifeView({data,save,records,baseball,today,theme,initialDay}:{initialDay?:string;data:Life;save:Save<Life>;records:Records;baseball:Baseball;today:string;theme:"light"|"dark"}) {
  const [tab,setTab]=useState(initialDay ? 2 : 0),[editing,setEdit]=useState<Mode|null>(null),[query,setQuery]=useState(""),[category,setCategory]=useState("");
  const [from,setFrom]=useState(""),[to,setTo]=useState(""),[groupId,setGroup]=useState(""),[day,setDay]=useState(initialDay ?? today);
  const [source,setSource]=useState(""),[importKind,setImport]=useState("activity"),[message,setMessage]=useState("");
  const [deleting,setDelete]=useState<{label:string;data:Life}|null>(null);
  const all=timeline(data,records,baseball);
  const recent=[...data.activities].sort((a,b)=>byDate({date:b.date,time:b.start},{date:a.date,time:a.start}));
  const monthly=data.activities.filter(row=>row.date.startsWith(today.slice(0,7)));
  const stats=activityStats(data.activities);
  const purchases=data.purchases.filter(row=>(!groupId || row.groupId===groupId)&&(!from||row.date>=from)&&(!to||row.date<=to));
  const rotations=rotationStats(purchases);
  const filtered=all.filter(row=>(!from||row.date>=from)&&(!to||row.date<=to)&&(!source||row.id.startsWith(source+":"))&&(!category||row.source===category)&&
    (row.title+" "+row.detail+" "+row.source).toLowerCase().includes(query.toLowerCase().trim()));
  const close=()=>setEdit(null);
  const commit=async(next:Life)=>{
    if (!await save(next)) return "저장하지 못했습니다.";
    close();return "";
  };
  const activityRows=(rows:typeof all)=>rows.length ? <ul className="rows finance-rows">{rows.map(row=>{
    const original=data.activities.find(item=>"life:"+item.id===row.id);
    return <li key={row.id}><div><strong>{row.title}</strong><p>{row.date} {row.time} · {row.source}{original && duration(original)!==null ? " · "+duration(original)+"분" : ""}</p>
      {row.detail && <p>{row.detail}</p>}{original?.mood && <p>{original.mood}</p>}</div>
      {original && <div className="row-actions"><Button variant="outline" onClick={()=>setEdit({kind:"activity",row:original})} aria-label={original.title+" 수정"}>수정</Button>
        <Button variant="ghost" onClick={()=>setDelete({label:original.title,data:{...data,activities:data.activities.filter(item=>item.id!==original.id)}})}>삭제</Button></div>}
    </li>;
  })}</ul> : <p className="empty">표시할 기록이 없습니다.</p>;
  const addPurchase=(id:string)=>setEdit({kind:"purchase",row:purchaseFrom({"결제자":"나"},id,today)});
  const activitySuggestions=[...new Set(recent.map(row=>row.title))].slice(0,15);
  const places=[...new Set(recent.map(row=>row.place).filter(Boolean))].slice(0,15);
  const groupChoices=data.groups.map(row=><option key={row.id} value={row.id}>{row.title}</option>);
  const filters=<section className="panel utility-filters"><label>시작일<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label>
    <label>종료일<input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label>
    {tab===1 && <><label>활동 분류<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">전체</option>{data.categories.map(row=><option key={row}>{row}</option>)}</select></label>
      <label>출처<select value={source} onChange={event=>setSource(event.target.value)}><option value="">전체</option>{options({life:"일상",purchase:"돌아가며 결제",schedule:"완료 일정",task:"완료 할 일",learning:"학습",baseball:"야구"})}</select></label>
      <label>내용·장소·동행·태그 검색<input value={query} onChange={event=>setQuery(event.target.value)}/></label></>}
    {tab===3 && <label>결제 그룹<select value={groupId} onChange={event=>setGroup(event.target.value)}><option value="">전체</option>{groupChoices}</select></label>}
  </section>;

  return <>
    <div className="page-title finance-heading"><h1>일상 기록</h1><div className="row-actions">
      <Button onClick={()=>setEdit({kind:"activity",row:todayActivity(today)})}>활동 등록</Button>
      <Button variant="outline" onClick={()=>setEdit({kind:"categories"})}>활동 분류 관리</Button>
    </div></div>
    <nav className="finance-tabs" aria-label="일상 메뉴">{tabs.map((name,index)=><button key={name} aria-pressed={tab===index} onClick={()=>setTab(index)}>{name}</button>)}</nav>
    {tab===0 && <>
      <Cards items={[[ "이번 달 일상 활동",monthly.length+"건"],["이번 달 내가 결제",wonText(rotationStats(data.purchases.filter(row=>row.date.startsWith(today.slice(0,7)))).selfAmount)]]}/>
      <section className="panel"><h2>오늘의 기록</h2>{activityRows(all.filter(row=>row.date===today))}</section>
      <section className="panel"><h2>최근 활동 빠른 등록</h2><div className="row-actions">{recent.slice(0,5).map(row=><Button variant="outline" key={row.id}
        onClick={()=>setEdit({kind:"activity",row:{...row,id:uuid(),date:today}})}>{row.title} 다시 기록</Button>)}</div>
        {activityRows(all.slice(-8).reverse())}</section>
      <div className="baseball-panels"><Breakdown title="자주 하는 활동" rows={stats.titles.slice(0,6)}/><Breakdown title="자주 방문한 장소" rows={stats.places.slice(0,6)}/></div>
      <section className="panel"><h2>최근 활동별 마지막 기록</h2><ul className="rows">{[...stats.latest].slice(-8).map(([title,row])=><li key={title}><span>{title}</span><span>{row.date}</span></li>)}</ul></section>
      <section className="panel"><h2>최근 방문 장소</h2><p>{places.join(" · ") || "장소 기록 없음"}</p></section>
      <section className="panel"><h2>최근 결제 그룹</h2><ul className="rows">{data.groups.map(group=>({group,state:turn(group,data.purchases)}))
        .sort((a,b)=>(b.state.last?.date ?? "").localeCompare(a.state.last?.date ?? "")).slice(0,6).map(({group,state})=><li key={group.id}>
          <span>{group.title} · {state.count}회</span><span>마지막 {state.last?.payer ?? "—"} · 다음 {state.next || "미지정"}</span></li>)}</ul></section>
    </>}
    {tab===1 && <>{filters}<section className="panel"><h2>일상 타임라인</h2>{activityRows(filtered)}</section></>}
    {tab===2 && <><section className="panel schedule-calendar"><h2>일상 캘린더</h2>
      <FullCalendar plugins={[dayGrid,interaction,classic]} initialView="dayGridMonth" initialDate={initialDay ?? today} locale={ko} colorScheme={theme}
        height="auto" dayMaxEvents={2} dateClick={event=>{setDay(event.dateStr);setEdit({kind:"activity",row:todayActivity(event.dateStr)});}}
        eventClick={event=>setDay(event.event.startStr.slice(0,10))}
        events={all.map(row=>({id:row.id,title:row.title,start:row.date,backgroundColor:lifeColor(row.source),textColor:"#fff"}))}/>
    </section><section className="panel"><div className="finance-heading"><h2>{day} 활동</h2><label>조회 날짜<input type="date" value={day} onChange={event=>setDay(event.target.value)}/></label>
      <Button onClick={()=>setEdit({kind:"activity",row:todayActivity(day || today)})}>이 날짜에 활동 등록</Button></div>{activityRows(all.filter(row=>row.date===day))}</section></>}
    {tab===3 && <>
      <div className="row-actions"><Button onClick={()=>setEdit({kind:"group",row:{id:uuid(),title:"",description:"",active:true,members:[],order:[],next:"",note:""}})}>결제 그룹 등록</Button>
        <Button variant="outline" disabled={!data.groups.some(row=>row.active)} onClick={()=>addPurchase(groupId || data.groups.find(row=>row.active)!.id)}>결제 기록 등록</Button></div>
      {filters}
      <div className="baseball-panels">{data.groups.filter(row=>!groupId || row.id===groupId).map(group=>{
        const current=turn(group,data.purchases);
        return <section className="panel" key={group.id}><h2>{group.title} · {group.active ? "활성" : "비활성"}</h2>
          <p>{group.description}</p><p>마지막 결제 {current.last?.payer ?? "—"} · {current.last?.date ?? "—"} · {current.count}회</p>
          <p>순서상 마지막 {current.participant?.payer ?? "—"} · 다음 {current.next || "미지정"}</p>
          <p>{group.order.join(" → ")} {group.note}</p><Button variant="outline" onClick={()=>setEdit({kind:"group",row:group})}>그룹 수정</Button></section>;
      })}</div>
      <Cards items={[[ "결제 / 모임",rotations.purchases+"회 / "+rotations.meetings+"회"],["내 결제",rotations.self+"회 · "+wonText(rotations.selfAmount)],
        ["다른 결제 / 적립",rotations.other+"회 / "+rotations.reward+"회"],["평균 / 금액 미입력",wonText(rotations.average)+" · "+rotations.unknown+"건"]]}/>
      <section className="panel"><h2>결제 이력</h2><ul className="rows finance-rows">{[...purchases].sort((a,b)=>byDate(b,a)).map(row=><li key={row.id}>
        <div><strong>{data.groups.find(group=>group.id===row.groupId)?.title} · {row.payer} · {wonText(row.amount)}</strong>
          <p>{row.date} {row.time} · {payKinds[row.kind]} · {[row.place,row.detail,row.session,row.round,row.note].filter(Boolean).join(" · ")}</p></div>
        <div className="row-actions"><Button variant="outline" aria-label={row.payer+" 결제 수정"} onClick={()=>setEdit({kind:"purchase",row})}>수정</Button>
          <Button variant="ghost" onClick={()=>setDelete({label:"결제 기록",data:{...data,purchases:data.purchases.filter(item=>item.id!==row.id)}})}>삭제</Button></div>
      </li>)}</ul></section>
      <div className="baseball-panels">
        <Breakdown title="그룹별 결제 횟수" rows={frequency(purchases,row=>data.groups.find(group=>group.id===row.groupId)?.title ?? "")}/>
        <Breakdown title="결제자별 횟수" rows={frequency(purchases,row=>row.payer)}/>
        <Breakdown title="결제자별 금액" rows={frequency(purchases.filter(row=>row.amount!==null),row=>row.payer).map(([payer])=>[payer,purchases.filter(row=>row.payer===payer && row.amount!==null).reduce((a,b)=>a+b.amount!,0)])} format={wonText}/>
        <Breakdown title="월별 결제 횟수" rows={frequency(purchases,row=>row.date.slice(0,7))}/>
        <Breakdown title="연도별 결제 횟수" rows={frequency(purchases,row=>row.date.slice(0,4))}/>
        <Breakdown title="자주 방문한 업체" rows={frequency(purchases,row=>row.place)}/>
        <Breakdown title="자주 구매한 내용" rows={frequency(purchases,row=>row.detail)}/>
      </div>
    </>}
    {tab===4 && <>
      <div className="baseball-panels">
        <Breakdown title="월별 활동" rows={frequency(data.activities,row=>row.date.slice(0,7))}/>
        <Breakdown title="연도별 활동" rows={frequency(data.activities,row=>row.date.slice(0,4))}/>
        <Breakdown title="활동 분류" rows={frequency(data.activities,row=>row.category || "미분류")}/>
        <Breakdown title="요일별 활동" rows={frequency(data.activities,row=>new Intl.DateTimeFormat("ko-KR",{weekday:"long",timeZone:"UTC"}).format(new Date(row.date+"T00:00:00Z")))}/>
        <Breakdown title="시간대별 활동" rows={stats.hours.map(([hour,count])=>[hour+"시",count])}/>
        <Breakdown title="방문 장소" rows={stats.places}/><Breakdown title="함께한 사람" rows={stats.people}/>
      </div>
      <section className="panel"><h2>활동별 마지막 기록 및 평균</h2><ul className="rows">{[...stats.latest].map(([title,row])=><li key={title}>
        <span>{title} · {row.date}</span><span>{row.minutes.length ? Math.round(row.minutes.reduce((a,b)=>a+b,0)/row.minutes.length)+"분" : "소요 시간 미집계"}</span>
      </li>)}</ul></section>
    </>}
    {tab===5 && <>
      <label>가져올 유형<select value={importKind} onChange={event=>setImport(event.target.value)}><option value="activity">일상 기록</option><option value="purchase">돌아가며 결제</option></select></label>
      <TableImport<Activity|Purchase> key={importKind} keyFor={signature} hint={importKind==="activity" ? "필수 머리글: 날짜, 제목. 선택: 분류, 시작, 종료, 분, 장소, 동행, 기분, 태그, 메모." :
        "필수 머리글: 날짜, 그룹, 결제자. 선택: 유형(적립), 시간, 장소, 내용, 금액, 동행, 모임, 회차, 메모. 그룹은 먼저 만들어 주세요."}
        parse={raw=>{
          if (!raw["날짜"]) return {error:"날짜를 입력해 주세요."};
          if (importKind==="activity") {
            const parsed=activitySchema.safeParse(activityFrom(raw,today));
            if (!parsed.success) return {error:"제목·날짜·시간 형식을 확인해 주세요."};
            return keyed(data.activities,[parsed.data]).length ? {row:parsed.data,title:parsed.data.title} : {error:"동일한 활동이 이미 있습니다."};
          }
          const group=data.groups.find(row=>row.title===raw["그룹"]);
          const parsed=purchaseSchema.safeParse(purchaseFrom(raw,group?.id ?? "",today));
          if (!parsed.success) return {error:"그룹·결제자·날짜·금액을 확인해 주세요."};
          return keyed(data.purchases,[parsed.data]).length ? {row:parsed.data,title:parsed.data.payer} : {error:"모든 항목이 동일한 결제가 이미 있습니다."};
        }} apply={rows=>importKind==="activity" ? save({...data,activities:[...data.activities,...keyed(data.activities,rows as Activity[])]}) :
          save({...data,purchases:[...data.purchases,...keyed(data.purchases,rows as Purchase[])]})}/>
      <Button variant="outline" onClick={()=>download(data,"onharu-life.json")}>일상·결제 JSON 내보내기</Button>
    </>}
    {editing?.kind==="activity" && <Editor title="일상 활동" close={close} submit={async form=>{
      const draft=activityFrom(Object.fromEntries([...form].map(([key,value])=>[key,String(value)])),today);
      const parsed=activitySchema.safeParse({...draft,id:editing.row.id});
      return parsed.success ? commit({...data,activities:replace(data.activities,parsed.data)}) : "날짜·제목·시작 시간과 종료 시간을 확인해 주세요.";
    }}>
      <Input name="날짜" label="날짜" type="date" value={editing.row.date} required/><Input name="제목" label="활동 제목" value={editing.row.title} list="life-titles" required/>
      <Select name="분류" label="분류" value={editing.row.category}><option value="">미분류</option>{[...new Set([...data.categories,editing.row.category].filter(Boolean))].map(row=><option key={row}>{row}</option>)}</Select>
      <Input name="시작" label="시작 시간" type="time" value={editing.row.start}/><Input name="종료" label="종료 시간" type="time" value={editing.row.end}/>
      <Input name="분" label="소요 시간 (분, 시작·종료 입력 시 자동)" type="number" value={editing.row.minutes}/>
      <Input name="장소" label="장소" value={editing.row.place} list="life-places"/><Input name="동행" label="함께한 사람 (쉼표 구분)" value={editing.row.people.join(", ")}/>
      <Input name="태그" label="태그 (쉼표 구분)" value={editing.row.tags.join(", ")}/><Input name="기분" label="기분 또는 상태" value={editing.row.mood}/>
      <label>상세 메모<textarea name="메모" defaultValue={editing.row.note} maxLength={1000}/></label>
      <datalist id="life-titles">{activitySuggestions.map(row=><option key={row} value={row}/>)}</datalist><datalist id="life-places">{places.map(row=><option key={row} value={row}/>)}</datalist>
    </Editor>}
    {editing?.kind==="categories" && <Editor title="활동 분류 관리" close={close} submit={async form=>{
      const before=field(form,"before"),after=field(form,"after");
      if (!after || after.length>100) return "분류명을 입력해 주세요.";
      if (after!==before && data.categories.includes(after)) return "이미 사용 중인 분류입니다.";
      return commit({...data,categories:before ? data.categories.map(row=>row===before ? after : row) : [...data.categories,after],
        activities:data.activities.map(row=>before && row.category===before ? {...row,category:after} : row)});
    }}><Select name="before" label="변경할 분류"><option value="">새 분류</option>{data.categories.map(row=><option key={row}>{row}</option>)}</Select><Input name="after" label="분류 이름" required/></Editor>}
    {editing?.kind==="group" && <Editor title="결제 그룹" close={close} submit={async form=>{
      const parsed=groupSchema.safeParse({id:editing.row.id,title:field(form,"title"),description:field(form,"description"),active:form.has("active"),
        members:split(field(form,"members")),order:split(field(form,"order")),next:field(form,"next"),note:field(form,"note")});
      return parsed.success ? commit({...data,groups:replace(data.groups,parsed.data)}) : "그룹명과 참여자 정보를 확인해 주세요.";
    }}>
      <Input name="title" label="그룹명" value={editing.row.title} required/><Input name="description" label="설명" value={editing.row.description}/>
      <Input name="members" label="참여 인원 (쉼표 구분)" value={editing.row.members.join(", ")}/>
      <Input name="order" label="결제 순서 (쉼표 구분)" value={editing.row.order.join(", ")}/>
      <Input name="next" label="다음 결제자 수동 지정 (비울 때까지 우선)" value={editing.row.next}/><Input name="note" label="메모" value={editing.row.note}/>
      <label><input type="checkbox" name="active" defaultChecked={editing.row.active}/>활성</label>
    </Editor>}
    {editing?.kind==="purchase" && <Editor title="돌아가며 결제 기록" close={close} submit={async form=>{
      const raw=Object.fromEntries([...form].map(([key,value])=>[key,String(value)]));
      const draft=purchaseFrom(raw,field(form,"group"),today);
      const parsed=purchaseSchema.safeParse({...draft,id:editing.row.id,kind:field(form,"유형"),payer:field(form,"유형")==="self" ? "나" : field(form,"결제자"),
        amount:num(form,"금액"),participates:form.has("participates")});
      if (!parsed.success) return "결제자·그룹·금액을 확인해 주세요.";
      return commit({...data,purchases:replace(data.purchases,parsed.data)});
    }}>
      <Select name="group" label="결제 그룹" value={editing.row.groupId}>{groupChoices}</Select>
      <Input name="날짜" label="결제 날짜" type="date" value={editing.row.date} required/><Input name="시간" label="결제 시간" type="time" value={editing.row.time}/>
      <Select name="유형" label="결제자 유형" value={editing.row.kind}>{options(payKinds)}</Select>
      <Input name="결제자" label="기타 결제자 또는 적립 수단" value={editing.row.kind==="self" ? "" : editing.row.payer} list="life-payers"/>
      <datalist id="life-payers">{[...new Set([...data.groups.flatMap(row=>row.members),...data.purchases.map(row=>row.payer)])].map(row=><option key={row} value={row}/>)}</datalist>
      <Input name="장소" label="장소 또는 업체명" value={editing.row.place}/><Input name="내용" label="구매 내용" value={editing.row.detail}/>
      <Input name="금액" label="결제 금액 (원)" type="number" value={editing.row.amount}/><Input name="동행" label="함께한 사람" value={editing.row.people.join(", ")}/>
      <Input name="모임" label="같은 날 모임 식별 이름" value={editing.row.session}/><Input name="회차" label="회차" value={editing.row.round}/>
      <Input name="메모" label="메모" value={editing.row.note}/><label><input type="checkbox" name="participates" defaultChecked={editing.row.participates}/>결제 순서에 반영</label>
    </Editor>}
    {deleting && <Editor title="기록 삭제 확인" close={()=>setDelete(null)} submit={async ()=>{
      if (!await save(deleting.data)) return "삭제하지 못했습니다.";
      setDelete(null);setMessage("기록을 삭제했습니다.");return "";
    }}><p>{deleting.label}을 삭제할까요?</p></Editor>}
    {message && <p role="status">{message}</p>}
  </>;
}
