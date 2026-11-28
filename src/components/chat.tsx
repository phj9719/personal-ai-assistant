"use client";

import { useRef, useState } from "react";
import { ArrowUp, AudioLines, ChevronDown, CornerDownLeft, History, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { useChatHistory } from "./workspace-data";
import { sendsOnEnter,type ChatAction } from "@/features/workspace/chat";
import type { ChatSession,Message } from "@/features/workspace/data";

const prompts = ["오늘 일정을 보고 싶어요", "할 일을 정리하고 싶어요", "이번 달 지출은 어디서 보나요?"];
type SendAction = Extract<ChatAction,{action:"start"|"send"}>;
type DialogState = {kind:"rename"|"delete";session:ChatSession} | {kind:"clear"};

export function Chat() {
  const [sessions, edit] = useChatHistory();
  const [id, select] = useState<string>();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogState|null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [dialogError,setDialogError] = useState("");
  const [managing,setManaging] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const activeManagement = useRef(false);
  const composing = useRef(false);
  const [unsaved,setUnsaved] = useState<SendAction|null>(null);
  const session = sessions.find(item => item.id === id);
  const last = session?.messages.at(-1);

  function chooseSession(sessionId?: string) {
    select(sessionId);
    setDraft("");
    setError("");
    setUnsaved(null);
    if (history.current) history.current.open = false;
    requestAnimationFrame(()=>composer.current?.focus());
  }

  async function ask(context:Message[], sessionId:string, replyTo:string, controller:AbortController) {
    const deadline = AbortSignal.timeout(125000);
    const response = await fetch("/api/ai/chat",{
      method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.any([controller.signal,deadline]),
      body:JSON.stringify({messages:context.slice(-10).map(({role,content})=>({role,content}))}),
    });
    const result = await response.json();
    if (!response.ok || typeof result.content !== "string") {
      setError(typeof result.error==="string" ? result.error : "AI 응답을 받지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!await edit({kind:"chat",action:"reply",sessionId,messageId:crypto.randomUUID(),replyTo,content:result.content})) {
      setError("답변을 저장하지 못했습니다. 같은 메시지로 다시 시도해 주세요.");
    }
  }

  async function run(request:(controller:AbortController)=>Promise<void>) {
    if (activeRequest.current || activeManagement.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError("");
    try {
      await request(controller);
    } catch (error) {
      setError(controller.signal.aborted ? "AI 응답을 취소했습니다." : error instanceof DOMException && error.name==="TimeoutError" ?
        "AI 응답 대기 시간이 지났습니다. 다시 시도해 주세요." : "AI 응답을 받지 못했습니다. 다시 시도해 주세요.");
    } finally {
      activeRequest.current = null;
      setPending(false);
    }
  }

  function send(text:string) {
    const content = text.trim();
    if (!content) return;
    const existing = session;
    const failed = unsaved;
    if (!failed && existing && last?.role==="user" && last.content===content) {
      void run(controller=>{
        setDraft("");
        return ask(existing.messages,existing.id,last.id ?? crypto.randomUUID(),controller);
      });
      return;
    }
    const command:SendAction = failed && failed.content===content
      ? failed
      : existing ? {kind:"chat",action:"send",sessionId:existing.id,messageId:crypto.randomUUID(),content} :
        {kind:"chat",action:"start",sessionId:crypto.randomUUID(),messageId:crypto.randomUUID(),content,title:content.slice(0,45)};
    void run(async controller=>{
      if (!await edit(command)) {
        setUnsaved(command);
        setDraft(content);
        setError("메시지를 저장하지 못했습니다. 같은 메시지로 다시 시도해 주세요.");
        return;
      }
      setUnsaved(null);
      select(command.sessionId);
      setDraft("");
      const context:Message[] = [...(existing?.messages.filter(message=>message.id!==command.messageId) ?? []),{id:command.messageId,role:"user",content}];
      await ask(context,command.sessionId,command.messageId,controller);
    });
  }

  function retry() {
    if (unsaved) send(unsaved.content);
    else if (session && last?.role==="user") {
      void run(controller=>ask(session.messages,session.id,last.id ?? crypto.randomUUID(),controller));
    }
  }

  function newline() {
    const element = composer.current;
    if (!element) return;
    const {selectionStart:start,selectionEnd:end} = element;
    if (draft.length-(end-start)>=2000) return;
    setDraft(draft.slice(0,start)+"\n"+draft.slice(end));
    requestAnimationFrame(()=>{element.focus();element.setSelectionRange(start+1,start+1);});
  }

  function openDialog(next:DialogState) {
    setDialog(next);
    setConfirmation("");
    setDialogError("");
  }

  async function manage(action:ChatAction) {
    if (activeRequest.current || activeManagement.current) return;
    activeManagement.current = true;
    setManaging(true);
    try {
      if (!await edit(action)) {setDialogError("채팅 변경을 저장하지 못했습니다. 다시 시도해 주세요.");return;}
      setDialog(null);
      if (action.action==="clear" || (action.action==="delete" && action.sessionId===id)) chooseSession();
    } finally {
      setManaging(false);
      activeManagement.current = false;
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
          {sessions.length ? <>
            <ul aria-label="이전 대화 목록">{sessions.map(item=><li className="chat-history-item" key={item.id}>
              <Button variant="ghost" aria-current={item.id === id ? "true" : undefined} disabled={pending} onClick={()=>chooseSession(item.id)}>{item.title}</Button>
              <Button className="chat-history-action" variant="ghost" aria-label={item.title+" 제목 변경"} disabled={pending} onClick={()=>openDialog({kind:"rename",session:item})}><Pencil size={16}/></Button>
              <Button className="chat-history-action" variant="ghost" aria-label={item.title+" 삭제"} disabled={pending} onClick={()=>openDialog({kind:"delete",session:item})}><Trash2 size={16}/></Button>
            </li>)}</ul>
            <Button variant="outline" className="chat-history-clear" disabled={pending} onClick={()=>openDialog({kind:"clear"})}>채팅 기록 전체 삭제</Button>
          </> : <p>저장된 대화가 없습니다.</p>}
        </div>
      </details>
    </div>
    <div className="chat-body">
      {session ? <div className="messages" aria-live="polite">{session.messages.map((message,index)=><div key={message.id ?? index} className={`message ${message.role}`}><span>{message.role === "user" ? "나" : "온하루"}</span><p>{message.content}</p></div>)}</div> :
        <div className="welcome">
          <span className="welcome-icon"><AudioLines size={32}/></span>
          <h1>오늘은 무엇을 도와드릴까요?</h1>
          <p>일정부터 생활 기록까지, 궁금한 것을 물어보세요.</p>
          <div className="suggestions">{prompts.map(prompt=><Button key={prompt} variant="outline" disabled={pending} onClick={()=>send(prompt)}>{prompt}</Button>)}</div>
        </div>}
    </div>
    {pending && <p role="status">답변을 작성하고 있어요…</p>}
    {error && <p className="alert" role="alert">{error}</p>}
    {!pending && (last?.role==="user" || (error && unsaved)) &&
      <div><Button variant="outline" onClick={retry}>같은 메시지로 다시 시도</Button></div>}
    <form className="composer" onSubmit={event=>{event.preventDefault();if (!composing.current) send(draft);}}>
      <textarea ref={composer} aria-label="메시지" aria-describedby="composer-shortcuts" placeholder="온하루에 메시지 보내기"
        value={draft} enterKeyHint="send" onChange={event=>setDraft(event.target.value)} maxLength={2000} rows={2}
        onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
        onKeyDown={event=>{
          if (!sendsOnEnter(event.nativeEvent,composing.current)) return;
          event.preventDefault();
          if (!event.repeat) send(draft);
        }}/>
      <span id="composer-shortcuts" className="sr-only">Enter는 전송, Shift와 Enter는 줄바꿈입니다.</span>
      <Button className="chat-newline" variant="ghost" type="button" aria-label="줄바꿈" onClick={newline}><CornerDownLeft size={18}/></Button>
      {pending ? <Button type="button" variant="outline" onClick={()=>activeRequest.current?.abort()}>취소</Button> : <Button type="submit" aria-label="보내기" disabled={!draft.trim()}><ArrowUp size={21}/></Button>}
    </form>
    {dialog && <dialog className="dialog" aria-labelledby="chat-dialog-title"
      ref={node=>{if (node && !node.open) node.showModal();}} onCancel={event=>{if (managing) event.preventDefault();else setDialog(null);}}>
      <h2 id="chat-dialog-title">{dialog.kind==="rename" ? "대화 제목 변경" : dialog.kind==="delete" ? "대화 삭제" : "채팅 기록 전체 삭제"}</h2>
      <form onSubmit={event=>{
        event.preventDefault();
        if (dialog.kind==="rename") {
          const title=String(new FormData(event.currentTarget).get("title") ?? "").trim();
          if (!title) {setDialogError("대화 제목을 입력해 주세요.");return;}
          void manage({kind:"chat",action:"rename",sessionId:dialog.session.id,title});
        } else if (dialog.kind==="delete") {
          void manage({kind:"chat",action:"delete",sessionId:dialog.session.id,confirmed:true});
        } else if (confirmation==="전체 삭제") {
          void manage({kind:"chat",action:"clear",confirmation});
        }
      }}>
        {dialog.kind==="rename" ? <label>대화 제목<input name="title" defaultValue={dialog.session.title} required maxLength={100} autoFocus/></label> :
          <p>{dialog.kind==="delete" ? `“${dialog.session.title}” 대화를 삭제할까요?` : "이 계정의 채팅 기록을 모두 삭제합니다."} 따로 저장한 AI 기억은 남습니다.</p>}
        {dialog.kind==="clear" && <label>확인 문구 ‘전체 삭제’<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off"/></label>}
        {dialogError && <p role="alert">{dialogError}</p>}
        <div className="row-actions"><Button type="button" variant="outline" disabled={managing} onClick={()=>setDialog(null)}>취소</Button>
          <Button type="submit" disabled={managing || (dialog.kind==="clear" && confirmation!=="전체 삭제")}>{dialog.kind==="rename" ? "저장" : "삭제"}</Button></div>
      </form>
    </dialog>}
  </section>;
}
