"use client";

import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import koLocale from "@fullcalendar/react/locales/ko";
import classicTheme from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { modules, summarize, type Entry, type ModuleKey, type Records } from "@/features/modules";
import { Button } from "./ui/button";

const number = new Intl.NumberFormat("ko-KR");

function Stats({items}:{items:[string,string][]}) {
  return <div className="stats">{items.map(([name,value])=><div className="panel stat" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>;
}

export function Summary({records,today,housingCost,consumption}:{records:Records;today:string;consumption:number;housingCost:{total:number|null;complete:boolean}}) {
  const stats = summarize(records,today.slice(0,7));
  const due = records.schedule.filter(row=>row.date === today);
  return <>
    <h1>대시보드</h1><p className="muted">{today} · 가상 데이터</p>
    <Stats items={[
      ["오늘 일정",`${due.length}건`],["남은 할 일",`${stats.open}건`],["이번 달 소비",`${number.format(consumption)}원`],
      ["재고 품목",`${records.inventory.length}개`],["이번 달 본인 주거비",housingCost.total===null ? "—" : `${number.format(housingCost.total)}원${housingCost.complete ? "" : " (확인분)"}`],["학습 기록",`${records.learning.filter(row=>row.group === "학습 기록").length}건`],
    ]}/>
    <section className="panel"><h2>오늘 일정</h2>{due.length ? <ul>{due.map(row=><li key={row.id}>{row.title}</li>)}</ul> : <p>등록된 일정이 없습니다.</p>}</section>
  </>;
}

function TransactionsChart({ rows, groups }: {rows:Entry[];groups:readonly string[]}) {
  const months = [...new Set(rows.map(row=>row.date.slice(0,7)))].sort().slice(-6);
  const data = months.map(month=>({
    month,...Object.fromEntries(groups.map(group=>[group,rows.filter(row=>row.group === group && row.date.startsWith(month)).reduce((sum,row)=>sum+row.amount,0)])),
  }));
  if (!data.length) return null;
  return <section className="panel chart"><h2>월별 합계</h2><ResponsiveContainer width="100%" height={240} minWidth={0}>
    <BarChart data={data}><CartesianGrid vertical={false} opacity={0.2}/><XAxis dataKey="month" tick={{fill:"var(--muted)"}}/><YAxis width={72} tick={{fill:"var(--muted)"}}/><Tooltip contentStyle={{background:"var(--surface)",borderColor:"var(--line)",color:"var(--ink)"}}/>{groups.map((group,index)=><Bar key={group} dataKey={group} fill={index ? "#82bdad" : "#5267e5"}/>)}</BarChart>
  </ResponsiveContainer></section>;
}

export function RecordsView({module,records,today,theme,consumption,onChange}:{module:ModuleKey;records:Records;today:string;theme:"light"|"dark";consumption?:number;onChange:(records:Records)=>Promise<boolean>}) {
  const config = modules[module];
  const [query,setQuery] = useState("");
  const [group,setGroup] = useState("");
  const [month,setMonth] = useState(today.slice(0,7));
  const [editing,setEditing] = useState<Entry|null>(null);
  const [deleting,setDeleting] = useState<Entry|null>(null);
  const monthly = module === "finance";
  const rows = records[module].filter(row=>(!group || row.group === group) &&
    (!monthly || !month || row.date.startsWith(month)) &&
    `${row.title} ${row.detail}`.toLowerCase().includes(query.toLowerCase()));
  const stats = summarize(records,month);
  function replace(entries:Entry[]) {return onChange({...records,[module]:entries});}
  return <>
    <div className="page-title"><div><h1>{config.title}</h1><p className="muted">{config.description}</p></div>
    <Button onClick={()=>setEditing({id:"",title:"",group:group || config.groups[0],date:today,amount:0,detail:""})}><Plus size={18}/>추가</Button></div>
    {module === "finance" && <Stats items={[["수입",number.format(stats.income)+"원"],["지출",number.format(stats.expense)+"원"],["차액",number.format(stats.income-stats.expense)+"원"]]}/>}
    {module === "analytics" && <Stats items={[["전체 활동 시간",stats.activity+"분"],["할 일 완료율",stats.completed+stats.open ? Math.round(100*stats.completed/(stats.completed+stats.open))+"%" : "0%"],["이번 달 소비",number.format(consumption ?? stats.expense)+"원"],["학습 기록",records.learning.filter(row=>row.group === "학습 기록").length+"건"]]}/>}
    <div className={monthly ? "records-content with-chart" : "records-content"}>
      {monthly && <TransactionsChart rows={records[module]} groups={config.groups}/>}
      <section className="panel">
        <div className="filters">
          <input aria-label="항목 검색" placeholder="검색" value={query} onChange={event=>setQuery(event.target.value)}/>
          <select aria-label="분류" value={group} onChange={event=>setGroup(event.target.value)}><option value="">전체</option>{config.groups.map(item=><option key={item}>{item}</option>)}</select>
          {monthly && <input type="month" aria-label="조회 월" value={month} onChange={event=>setMonth(event.target.value)}/>}
        </div>
        {module === "schedule" && <div className="schedule-calendar">
          <FullCalendar
            plugins={[dayGridPlugin, classicTheme]}
            initialView="dayGridMonth"
            initialDate={today}
            locale={koLocale}
            colorScheme={theme}
            height="auto"
            headerToolbar={{start:"title",center:"",end:"today prev,next"}}
            toolbarClass="calendar-toolbar"
            dayMaxEvents={2}
            events={rows.map(row=>({id:row.id,title:row.title,date:row.date}))}
            eventClick={event=>setEditing(rows.find(row=>row.id === event.event.id) ?? null)}
          />
        </div>}
        {rows.length ? <ul className="rows">{rows.map(row=><li key={row.id}>
          <div><strong>{row.title}</strong><p>{[row.group,row.date,config.unit && number.format(row.amount)+config.unit].filter(Boolean).join(" · ")}</p>{row.detail && <p>{row.detail}</p>}</div>
          <div className="row-actions">{module === "tasks" && row.group !== "완료" && <Button variant="outline" onClick={()=>replace(records[module].map(item=>item.id === row.id ? {...item,group:"완료"} : item))}>완료</Button>}
          <Button variant="ghost" aria-label={row.title+" 수정"} onClick={()=>setEditing(row)}><Pencil size={17}/></Button>
          <Button variant="ghost" aria-label={row.title+" 삭제"} onClick={()=>setDeleting(row)}><Trash2 size={17}/></Button></div>
        </li>)}</ul> : <p className="empty">표시할 항목이 없습니다.</p>}
      </section>
    </div>
    {editing && <dialog ref={element=>{if (element && !element.open) element.showModal();}} onCancel={()=>setEditing(null)} aria-labelledby="entry-title" className="dialog"><form onSubmit={async event=>{
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const title = String(data.get("title")).trim();
      if (!title) {
        const field = event.currentTarget.elements.namedItem("title") as HTMLInputElement;
        field.setCustomValidity("이름을 입력해 주세요.");
        field.reportValidity();
        return;
      }
      const item:Entry = {id:editing.id || crypto.randomUUID(),title,group:String(data.get("group")),date:String(data.get("date")),amount:Number(data.get("amount") ?? 0),detail:String(data.get("detail")).trim()};
      if (await replace(editing.id ? records[module].map(row=>row.id === item.id ? item : row) : [...records[module],item])) setEditing(null);
    }}>
      <h2 id="entry-title">{editing.id ? "항목 수정" : "항목 추가"}</h2>
      <label>이름<input autoFocus name="title" defaultValue={editing.title} required maxLength={100} onInput={event=>event.currentTarget.setCustomValidity("")}/></label>
      <label>분류<select name="group" defaultValue={editing.group}>{config.groups.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>날짜<input name="date" type="date" defaultValue={editing.date} required/></label>
      {config.unit && <label>수량 또는 금액 ({config.unit})<input name="amount" type="number" min={module === "finance" ? 1 : 0} max={999999999} defaultValue={editing.amount} required/></label>}
      <label>상세 내용<textarea name="detail" maxLength={1000} defaultValue={editing.detail}/></label>
      <div className="row-actions"><Button type="button" variant="outline" onClick={()=>setEditing(null)}>취소</Button><Button type="submit">저장</Button></div>
    </form></dialog>}
    {deleting && <dialog ref={element=>{if (element && !element.open) element.showModal();}} onCancel={()=>setDeleting(null)} aria-labelledby="delete-title" className="dialog"><h2 id="delete-title">항목 삭제</h2><p>{deleting.title} 항목을 삭제할까요?</p><div className="row-actions"><Button variant="outline" onClick={()=>setDeleting(null)}>취소</Button><Button onClick={async ()=>{if (await replace(records[module].filter(row=>row.id !== deleting.id))) setDeleting(null);}}>삭제</Button></div></dialog>}
  </>;
}
