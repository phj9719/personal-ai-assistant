import { z } from "zod";

export const chatTitle = z.string().trim().min(1).max(100);
const uuid = z.uuid();
const content = z.string().trim().min(1).max(2000);
const session = {sessionId:uuid};
const message = {messageId:uuid,content};
export const chatAction = z.discriminatedUnion("action",[
  z.strictObject({kind:z.literal("chat"),action:z.literal("start"),...session,...message,title:chatTitle}),
  z.strictObject({kind:z.literal("chat"),action:z.literal("send"),...session,...message}),
  z.strictObject({kind:z.literal("chat"),action:z.literal("reply"),...session,...message,replyTo:uuid}),
  z.strictObject({kind:z.literal("chat"),action:z.literal("rename"),...session,title:chatTitle}),
  z.strictObject({kind:z.literal("chat"),action:z.literal("delete"),...session,confirmed:z.literal(true)}),
  z.strictObject({kind:z.literal("chat"),action:z.literal("clear"),confirmation:z.literal("전체 삭제")}),
]);
export type ChatAction = z.infer<typeof chatAction>;

export function sendsOnEnter(key:{key:string;shiftKey:boolean;isComposing:boolean;keyCode:number},composing:boolean) {
  return key.key==="Enter" && !key.shiftKey && !key.isComposing && !composing && key.keyCode!==229;
}
