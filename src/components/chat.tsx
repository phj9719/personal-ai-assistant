"use client";

import { useRef, useState } from "react";
import { ArrowUp, AudioLines, ChevronDown, History, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { useWorkspaceData } from "./workspace-data";
import type { Message } from "@/features/workspace/data";

const prompts = ["오늘 일정을 보고 싶어요", "할 일을 정리하고 싶어요", "이번 달 지출은 어디서 보나요?"];

export function Chat() {
  const [sessions, save] = useWorkspaceData("chat", []);
  const [id, select] = useState<string>();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const session = sessions.find(item => item.id === id);

  function chooseSession(sessionId?: string) {
    select(sessionId);
    setDraft("");
    setError("");
    if (history.current) history.current.open = false;
    requestAnimationFrame(()=>composer.current?.focus());
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const current = session ?? {id:crypto.randomUUID(),title:content.slice(0,45),messages:[]};
    const messages:Message[] = [...current.messages,{role:"user",content}];
    const others = sessions.filter(item=>item.id !== current.id);
    setError("");
    setPending(true);
    try {
      if (!await save([{...current,messages},...others])) return;
      select(current.id);
      setDraft("");
      const response = await fetch("/api/ai/chat",{
        method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,
        body:JSON.stringify({messages:messages.slice(-10)}),
      });
      const result = await response.json();
      if (!response.ok || typeof result.content !== "string") throw new Error("AI 응답 오류");
      // The first write advanced the document revision before this response arrived.
      await save([{...current,messages:[...messages,{role:"assistant",content:result.content}]},...others]);
    } catch {
      setError(controller.signal.aborted ? "응답을 취소했습니다." : "응답을 받지 못했습니다. 다시 질문해 주세요.");
    } finally {
      activeRequest.current = null;
      setPending(false);
    }
  }

  return <section className="chat">
    <div className="chat-toolbar">
      <Button variant="outline" disabled={pending} onClick={()=>chooseSession()}><Plus size={16}/>새 채팅</Button>
      <details ref={history} className="chat-history" onKeyDown={event=>{
        if (event.key === "Escape" && event.currentTarget.open) {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary className="button outline"><History size={16} aria-hidden/>이전 대화<ChevronDown size={15} aria-hidden/></summary>
        <div className="chat-history-panel">
          {sessions.length ? <ul aria-label="이전 대화 목록">{sessions.map(item=><li key={item.id}>
            <Button variant="ghost" aria-current={item.id === id ? "true" : undefined} disabled={pending} onClick={()=>chooseSession(item.id)}>{item.title}</Button>
          </li>)}</ul> : <p>저장된 대화가 없습니다.</p>}
        </div>
      </details>
    </div>
    <div className="chat-body">
      {session ? <div className="messages" aria-live="polite">{session.messages.map((message,index)=><div key={index} className={`message ${message.role}`}><span>{message.role === "user" ? "나" : "온하루"}</span><p>{message.content}</p></div>)}{pending && <p role="status">답변을 작성하고 있어요…</p>}</div> :
        <div className="welcome">
          <span className="welcome-icon"><AudioLines size={32}/></span>
          <h1>오늘은 무엇을 도와드릴까요?</h1>
          <p>일정부터 생활 기록까지, 궁금한 것을 물어보세요.</p>
          <div className="suggestions">{prompts.map(prompt=><Button key={prompt} variant="outline" onClick={()=>void send(prompt)}>{prompt}</Button>)}</div>
        </div>}
    </div>
    {error && <p className="alert" role="alert">{error}</p>}
    <form className="composer" onSubmit={event=>{event.preventDefault();void send(draft);}}>
      <textarea ref={composer} aria-label="메시지" placeholder="온하루에 메시지 보내기" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={2000} rows={2}/>
      {pending ? <Button type="button" variant="outline" onClick={()=>activeRequest.current?.abort()}>취소</Button> : <Button type="submit" aria-label="보내기" disabled={!draft.trim()}><ArrowUp size={21}/></Button>}
    </form>
  </section>;
}
