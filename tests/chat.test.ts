import assert from "node:assert/strict";
import test from "node:test";
import { chatAction,sendsOnEnter } from "../src/features/workspace/chat.ts";
import { aiBudget,aiFailure } from "../src/lib/ai/failure.ts";
import { conversation,OllamaProvider,ProviderError } from "../src/lib/ai/provider.ts";

const enter = {key:"Enter",shiftKey:false,isComposing:false,keyCode:13};
const sessionId = "7b11d603-5a83-4be6-bece-c53740ee9fe1";
const messageId = "84af64e6-adb1-4e26-8119-5fa4b4e32190";

test("Enter sends only outside composition, while Shift+Enter leaves native line breaks",()=>{
  assert.equal(sendsOnEnter(enter,false),true);
  assert.equal(sendsOnEnter({...enter,shiftKey:true},false),false);
  assert.equal(sendsOnEnter({...enter,isComposing:true},false),false);
  assert.equal(sendsOnEnter({...enter,keyCode:229},false),false);
  assert.equal(sendsOnEnter(enter,true),false);
  assert.equal(sendsOnEnter({...enter,key:"a"},false),false);
});

test("chat mutations require explicit delete confirmations and reject injected owners and blank messages",()=>{
  assert.ok(chatAction.safeParse({kind:"chat",action:"clear",confirmation:"전체 삭제"}).success);
  assert.equal(chatAction.safeParse({kind:"chat",action:"clear",confirmation:"삭제"}).success,false);
  assert.equal(chatAction.safeParse({kind:"chat",action:"delete",sessionId,confirmed:false}).success,false);
  assert.equal(chatAction.safeParse({kind:"chat",action:"rename",sessionId,title:"변경",userId:sessionId}).success,false);
  assert.equal(chatAction.safeParse({kind:"chat",action:"send",sessionId,messageId,content:"  \n  "}).success,false);
  assert.equal(conversation.safeParse({messages:[{role:"user",content:"  "}]}).success,false);
});

test("AI failures have bounded settings and safe user-facing messages",()=>{
  assert.equal(aiBudget(undefined),25000);
  assert.equal(aiBudget("1000"),1000);
  assert.equal(aiBudget("5000000"),25000);
  assert.equal(aiFailure(new ProviderError("connection")).status,503);
  assert.equal(aiFailure(new ProviderError("unavailable",503)).upstreamStatus,503);
  assert.equal(aiFailure(new ProviderError("model",404)).status,502);
  assert.equal(aiFailure(new Error("private body"),"timeout").status,504);
  assert.doesNotMatch(aiFailure(new Error("private body")).message,/private body/);
});

test("Ollama provider maps availability errors without exposing upstream content",async()=>{
  const original = globalThis.fetch;
  const provider = new OllamaProvider("http://127.0.0.1:1","fixture");
  const messages = [{role:"user" as const,content:"가상 질문"}];
  const signal = new AbortController().signal;
  try {
    globalThis.fetch = async ()=>new Response("private body",{status:503});
    await assert.rejects(provider.reply(messages,signal),{reason:"unavailable",upstreamStatus:503});
    globalThis.fetch = async ()=>{throw new Error("private upstream");};
    await assert.rejects(provider.reply(messages,signal),{reason:"connection"});
    globalThis.fetch = async ()=>Response.json({message:{content:"가상 답변"}});
    assert.equal(await provider.reply(messages,signal),"가상 답변");
  } finally { globalThis.fetch=original; }
});
