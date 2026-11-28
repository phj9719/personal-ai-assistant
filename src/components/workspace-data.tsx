"use client";

import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {browserKeys,domains,emptyData,type Documents,type Domain,type WorkspaceData} from "@/features/workspace/data";
import type {ChatAction} from "@/features/workspace/chat";
import type {ChatSession} from "@/features/workspace/data";
import type {MonthlyDeletion} from "@/features/finance/monthly-deletion";
import {hasOutsideResidenceBills} from "@/features/utilities/model";
import {Button} from "./ui/button";
import {useLocal} from "./use-local";

type Storage = {
  documents:Documents;
  write:(body:unknown)=>Promise<boolean>;
};
const StorageContext = createContext<Storage|null>(null);

export function WorkspaceStorage({remote,children}:{remote:boolean;children:ReactNode}) {
  const [documents,setDocuments] = useState<Documents|null>(null);
  const [error,setError] = useState("");
  const [pending,setPending] = useState(false);
  const busy = useRef(false);
  const read = useCallback(async (signal?:AbortSignal)=>{
    const deadline = AbortSignal.timeout(15000);
    const response = await fetch("/api/workspace",{cache:"no-store",signal:signal ? AbortSignal.any([signal,deadline]) : deadline});
    if (!response.ok) throw new Error(response.status===401 ? "로그인이 만료되었습니다. 다시 로그인해 주세요." : "데이터베이스에서 데이터를 불러오지 못했습니다.");
    const result = await response.json() as {documents:Documents};
    setDocuments(result.documents);
    setError("");
  },[]);
  useEffect(()=>{
    if (!remote) return;
    const controller = new AbortController();
    void Promise.resolve().then(()=>read(controller.signal)).catch(error=>{if (!controller.signal.aborted) setError(error.message);});
    return ()=>controller.abort();
  },[remote,read]);

  async function write(body:unknown) {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/workspace",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
      });
      const result = await response.json() as {documents?:Documents;error?:string};
      if (!response.ok || !result.documents) {
        if (response.status===409) await read();
        throw new Error(result.error ?? "저장하지 못했습니다.");
      }
      setDocuments(current=>({...current,...result.documents}));
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "저장하지 못했습니다.");
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (!remote) return children;
  if (!documents) return <main className="page">
    <p role={error ? "alert" : "status"}>{error || "저장된 데이터를 불러오는 중입니다."}</p>
    {error && <Button onClick={()=>{setError("");void read().catch(failure=>setError(failure.message));}}>다시 시도</Button>}
  </main>;
  return <StorageContext.Provider value={{documents,write}}>
    <fieldset disabled={pending} className="min-w-0 border-0 p-0">
      {children}
    </fieldset>
    {(error || pending) && <div role={error ? "alert" : "status"} className="workspace-data-notice">
      {error || "데이터를 저장하는 중입니다."}
      {error && <Button variant="ghost" onClick={()=>setError("")}>닫기</Button>}
    </div>}
  </StorageContext.Provider>;
}

export type Save<T> = (value:T,confirmation?:boolean|MonthlyDeletion)=>Promise<boolean>;

export function useWorkspaceData<K extends Domain>(domain:K,fallback:WorkspaceData[K]):readonly [WorkspaceData[K],Save<WorkspaceData[K]>] {
  const remote = useContext(StorageContext);
  const [local,saveLocal] = useLocal(browserKeys[domain],fallback,remote===null);
  const document = remote?.documents[domain];
  const value = remote ? (document ? document.value as WorkspaceData[K] : emptyData[domain]) : local;
  let revision = document?.revision ?? 0;
  return [value,async (next,confirmation)=>{
    if (remote) {
      const saved = await remote.write({domain,revision,value:next,confirmedOutsideResidence:confirmation===true ? true : undefined,monthlyDeletion:typeof confirmation==="object" ? confirmation : undefined});
      if (saved) revision++;
      return saved;
    }
    saveLocal(next);
    return true;
  }];
}

export function useChatHistory():readonly [ChatSession[],(action:ChatAction)=>Promise<boolean>] {
  const remote = useContext(StorageContext);
  const [local,saveLocal,current] = useLocal<ChatSession[]>(browserKeys.chat,[],remote===null);
  const sessions = remote ? (remote.documents.chat?.value as ChatSession[] | undefined) ?? [] : local;
  return [sessions,async action=>{
    if (remote) return remote.write(action);
    saveLocal(editLocalChat(current(),action));
    return true;
  }];
}

function editLocalChat(sessions:ChatSession[],action:ChatAction) {
  if (action.action==="clear") return [];
  if (action.action==="delete") return sessions.filter(session=>session.id!==action.sessionId);
  if (action.action==="rename") return sessions.map(session=>session.id===action.sessionId ? {...session,title:action.title} : session);
  const existing = sessions.find(session=>session.id===action.sessionId);
  const target = existing ?? (action.action==="start" ? {id:action.sessionId,title:action.title,messages:[]} : null);
  if (!target || target.messages.some(message=>message.id===action.messageId)) return sessions;
  const role = action.action==="reply" ? "assistant" as const : "user" as const;
  const next = {...target,messages:[...target.messages,{id:action.messageId,role,content:action.content}]};
  return [next,...sessions.filter(session=>session.id!==target.id)];
}

const labels:Record<Domain,string> = {
  life:"일상 기록·돌아가며 결제",subscriptions:"구독 서비스·결제 이력",
  records:"일정·할 일·가계부 거래·재고·메모·개발·생활 기록",
  utilities:"거주 기간 및 공과금",finance:"고정 지출·저축·투자·결제수단",
  baseball:"야구 경기·예매·직관",settlements:"정산·대납 및 입금",chat:"채팅 세션과 메시지",memories:"AI 기억",theme:"테마",
};

function browserData() {
  const data:Partial<Record<Domain,unknown>> = {};
  for (const domain of domains) {
    if (domain==="theme") continue;
    const raw = localStorage.getItem(browserKeys[domain]);
    if (raw!==null) data[domain] = JSON.parse(raw);
  }
  return data;
}

export function BrowserImport() {
  const remote = useContext(StorageContext);
  const [preview,setPreview] = useState<Partial<Record<Domain,unknown>>|null>(null);
  const [confirmed,setConfirmed] = useState(false);
  const [status,setStatus] = useState("");
  const [outside,setOutside] = useState(false);
  const warns = hasOutsideResidenceBills(preview?.utilities);

  function showPreview(data:unknown) {
    setConfirmed(false);
    setOutside(false);
    setPreview(null);
    if (!data || typeof data!=="object" || Array.isArray(data) ||
      Object.keys(data).some(key=>key==="theme" || !domains.includes(key as Domain))) {
      setStatus("온하루에서 내보낸 JSON 파일을 선택해 주세요.");
      return;
    }
    if (!Object.keys(data).length) setStatus("가져올 데이터가 없습니다.");
    else {setPreview(data);setStatus("");}
  }

  if (!remote) return <section className="panel settings">
    <h2>브라우저 데이터 내보내기</h2>
    <p>운영 주소가 다를 때 이 브라우저에 저장한 데이터를 파일로 옮길 수 있습니다.</p>
    <div><Button variant="outline" onClick={()=>{
      try {
        const data = browserData();
        if (!Object.keys(data).length) {setStatus("내보낼 데이터가 없습니다.");return;}
        const url = URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"}));
        const link = document.createElement("a");
        link.href=url;
        link.download="onharu-browser-data.json";
        link.click();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        setStatus("내보낸 파일에 개인 기록이 포함될 수 있습니다. 안전한 곳에 보관해 주세요.");
      } catch {setStatus("브라우저 데이터를 내보낼 수 없습니다.");}
    }}>브라우저 데이터 내보내기</Button></div>
    {status && <p role="status">{status}</p>}
  </section>;
  return <section className="panel settings">
    <h2>브라우저 데이터 가져오기</h2>
    <p>이 주소의 브라우저 데이터 또는 온하루에서 내보낸 파일을 확인합니다. 가져오기는 대상 영역이 비어 있을 때 한 번만 실행되며 원본은 보존됩니다.</p>
    <div><Button variant="outline" onClick={()=>{
      try {showPreview(browserData());}
      catch {setPreview(null);setConfirmed(false);setStatus("브라우저의 저장 데이터를 읽을 수 없습니다.");}
    }}>가져올 항목 확인</Button></div>
    <label>온하루 데이터 파일<input type="file" accept=".json,application/json" onChange={async event=>{
      const input=event.currentTarget;
      const file=input.files?.[0];
      input.value="";
      if (!file) return;
      setPreview(null);
      setConfirmed(false);
      if (file.size>4*1024*1024-1024) {setStatus("가져올 파일이 4 MiB 제한을 넘었습니다.");return;}
      try {showPreview(JSON.parse(await file.text()));}
      catch {setStatus("온하루 데이터 파일을 읽지 못했습니다.");}
    }}/></label>
    {preview && <>
      <ul>{domains.filter(domain=>Object.hasOwn(preview,domain)).map(domain=><li key={domain}>{labels[domain]}</li>)}</ul>
      <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>현재 계정으로 위 데이터를 가져오는 데 동의합니다.</label>
      {warns && <label><input type="checkbox" checked={outside} onChange={event=>setOutside(event.target.checked)}/>거주 기간과 겹치지 않는 청구를 실제 관리비로 가져오는 데 동의합니다.</label>}
      <div><Button disabled={!confirmed || (warns && !outside)} onClick={async ()=>{
        if (await remote.write({kind:"import",confirmed:true,confirmedOutsideResidence:outside ? true : undefined,data:preview})) {
          setPreview(null);
          setConfirmed(false);
          setStatus("데이터를 가져왔습니다.");
        }
      }}>가져오기</Button></div>
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
