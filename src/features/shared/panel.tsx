"use client";

import {useState,type ReactNode} from "react";
import {tableRows} from "./import";
import {Button} from "@/components/ui/button";

export const field=(data:FormData,key:string)=>String(data.get(key) ?? "").trim();
export const num=(data:FormData,key:string)=>field(data,key)==="" ? null : Number(field(data,key).replace(/[,\s]/g,""));
export const options=(values:Record<string,string>)=>Object.entries(values).map(([key,label])=><option key={key} value={key}>{label}</option>);
export const wonText=(value:number|null)=>value===null ? "미확인" : new Intl.NumberFormat("ko-KR").format(Math.round(value))+"원";
export const download=(data:unknown,name:string)=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export function Input({name,label,value,required=false,type="text",list,step,readOnly}:{readOnly?:boolean;
  name:string;label:string;value?:string|number|null;required?:boolean;type?:string;list?:string;step?:number;
}) {
  return <label>{label}<input name={name} type={type} defaultValue={value ?? ""} required={required} readOnly={readOnly} maxLength={1000}
    min={type==="number" ? 0 : undefined} step={step} list={list}/></label>;
}
export function Select({name,label,value,children}:{name:string;label:string;value?:string|null;children:ReactNode}) {
  return <label>{label}<select name={name} defaultValue={value ?? ""}>{children}</select></label>;
}
export function Editor({title,close,submit,children}:{title:string;close:()=>void;submit:(data:FormData)=>Promise<string>;children:ReactNode}) {
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  return <dialog className="dialog settlement-dialog" aria-label={title} ref={node=>{if (node && !node.open) node.showModal();}} onCancel={event=>{if (busy) event.preventDefault();else close();}}>
    <h2>{title}</h2>
    <form onSubmit={async event=>{
      event.preventDefault();
      if (busy) return;
      const data=new FormData(event.currentTarget);
      setBusy(true);
      try {setError(await submit(data));}
      catch (failure) {setError(failure instanceof Error ? failure.message : "저장하지 못했습니다.");}
      finally {setBusy(false);}
    }}>
      <div className="settlement-inline">{children}</div>
      {error && <p role="alert">{error}</p>}
      <div className="row-actions"><Button type="button" variant="outline" disabled={busy} onClick={close}>취소</Button><Button type="submit" disabled={busy}>저장</Button></div>
    </form>
  </dialog>;
}
export function Cards({items}:{items:[string,string][]}) {
  return <div className="stats">{items.map(([label,value])=><div key={label} className="panel stat"><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
export function Breakdown({title,rows,format=String}:{title:string;rows:[string,number][];format?:(value:number)=>string}) {
  return <section className="panel"><h2>{title}</h2>{rows.length ? <ul className="rows">{rows.map(([name,value])=><li key={name}><span>{name}</span><strong>{format(value)}</strong></li>)}</ul> :
    <p className="muted">표시할 데이터가 없습니다.</p>}</section>;
}

type Preview<T>={row?:T;error?:string;title?:string};
export function TableImport<T>({hint,parse,apply,keyFor}:{keyFor?:(row:T)=>string;hint:string;parse:(row:Record<string,string>)=>Preview<T>;apply:(rows:T[])=>Promise<boolean>}) {
  const [input,setInput]=useState("");
  const [preview,setPreview]=useState<Preview<T>[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const change=(value:string)=>{setInput(value);setPreview([]);setMessage("");};
  return <section className="panel settings">
    <h2>표 가져오기</h2><p>{hint}</p>
    <label>CSV 파일<input type="file" accept=".csv,text/csv" onChange={async event=>{
      const file=event.currentTarget.files?.[0];
      event.currentTarget.value="";
      if (!file) return;
      if (file.size>500000) {change("");setMessage("500KB 이하 파일을 선택해 주세요.");return;}
      try {change(await file.text());} catch {setMessage("파일을 읽을 수 없습니다.");}
    }}/></label>
    <label>Excel·Markdown·CSV 붙여넣기<textarea aria-label="표 붙여넣기" value={input} onChange={event=>change(event.target.value)} maxLength={500000} rows={5}/></label>
    <div><Button variant="outline" onClick={()=>{
      try {const rows=tableRows(input);if (rows.length>1200) throw new Error("최대 1200행까지 가져올 수 있습니다.");
        const existing=new Set<string>();
        setPreview(rows.map(raw=>{
          const result=parse(raw);
          if (!result.row || result.error || !keyFor) return result;
          const key=keyFor(result.row);
          if (existing.has(key)) return {error:"같은 표의 앞 행과 중복됩니다."};
          existing.add(key);
          return result;
        }));setMessage(rows.length ? "" : "가져올 행이 없습니다.");} catch (error) {setPreview([]);setMessage((error as Error).message);}
    }}>미리보기</Button></div>
    {preview.length>0 && <>
      <ul className="rows baseball-preview">{preview.map((row,index)=><li key={index}><span>{index+2}행</span><span>{row.error ?? row.title ?? "등록 가능"}</span></li>)}</ul>
      <div><Button disabled={busy || !preview.some(row=>row.row && !row.error)} onClick={async ()=>{
        setBusy(true);
        try {
          const rows=preview.flatMap(row=>row.row && !row.error ? [row.row] : []);
          if (await apply(rows)) {change("");setMessage(rows.length+"건을 가져왔습니다.");}
          else setMessage("저장하지 못했습니다. 중복과 입력값을 확인해 주세요.");
        } finally {setBusy(false);}
      }}>정상 행만 등록</Button></div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
