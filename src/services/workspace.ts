import {needsResidenceConfirmation,type UtilityState} from "../features/utilities/model";
import {subscriptionHistoryError,subscriptionLinks} from "../features/subscriptions/links";
import {chatAction} from "../features/workspace/chat";
import {changeChat,ChatWriteConflict,readChat} from "../repositories/chat";
import { DocumentConstraint,importDocuments,readDocuments,writeDocument } from "../repositories/workspace";
import {baseballGuard} from "./baseball-validation";
import {settlementGuard} from "./settlement-validation";
import { domains,emptyData,type WorkspaceData,type Domain,type Documents } from "../features/workspace/data";
import { importRequest, parseDocument, writeRequest } from "./workspace-validation";

export async function readWorkspace(userId:string) {
  const [documents,sessions] = await Promise.all([readDocuments(userId),readChat(userId)]);
  return {...documents,chat:{revision:0,value:sessions}};
}

export async function saveWorkspace(userId:string,body:unknown) {
  try { return await persist(userId,body); }
  catch (error) {
    if (error instanceof ChatWriteConflict) return {status:409,error:"같은 메시지 식별자로 다른 요청을 저장할 수 없습니다."} as const;
    if (error instanceof DocumentConstraint) return {status:422,error:error.message} as const;
    throw error;
  }
}

async function persist(userId:string,body:unknown) {
  const chat = chatAction.safeParse(body);
  if (chat.success) {
    const sessions = await changeChat(userId,chat.data);
    return sessions ? {status:200,documents:{chat:{revision:0,value:sessions}}} as const :
      {status:404,error:"대화 또는 메시지를 찾을 수 없습니다."} as const;
  }
  const importing = importRequest.safeParse(body);
  if (importing.success) {
    const entries:[Domain,unknown][] = [];
    for (const domain of domains) {
      if (!Object.hasOwn(importing.data.data,domain)) continue;
      const parsed = parseDocument(domain,importing.data.data[domain]);
      if (!parsed.success) return {status:400,error:"가져올 브라우저 데이터 형식을 확인해 주세요."} as const;
      entries.push([domain,parsed.data]);
    }
    if (!entries.length) return {status:400,error:"가져올 데이터가 없습니다."} as const;
    const documents = await importDocuments(userId,entries,workspaceGuard(importing.data.confirmedOutsideResidence));
    return documents ? {status:200,documents} as const :
      {status:409,error:"대상 영역에 데이터가 있거나 이전에 가져오기를 완료했습니다. 기존 데이터는 유지됩니다."} as const;
  }
  const update = writeRequest.safeParse(body);
  if (!update.success) return {status:400,error:"저장 요청 형식을 확인해 주세요."} as const;
  const {domain,revision,value} = update.data;
  if (domain==="chat") return {status:400,error:"채팅 기록은 채팅 작업 요청으로 관리합니다."} as const;
  const document = parseDocument(domain,value);
  if (!document.success) return {status:400,error:"유효하지 않거나 중복된 데이터가 있습니다."} as const;
  const saved = await writeDocument(userId,domain,revision,document.data,workspaceGuard(update.data.confirmedOutsideResidence));
  return saved ? {status:200,documents:{[domain]:saved}} as const :
    {status:409,error:"다른 탭에서 데이터가 변경되었습니다. 최신 데이터를 불러왔으니 확인 후 다시 시도해 주세요."} as const;
}

function workspaceGuard(confirmedOutsideResidence?:true) {
  return (current:Documents,changes:[Domain,unknown][])=>{
    const utility = changes.find(([domain])=>domain==="utilities")?.[1] as UtilityState|undefined;
    if (utility && !confirmedOutsideResidence && needsResidenceConfirmation(current.utilities?.value as UtilityState|undefined,utility)) {
      return "거주 기간과 겹치지 않는 청구가 있습니다. 실제 관리비로 저장하려면 확인해 주세요.";
    }
    return guardWorkspace(current,changes);
  };
}

function guardWorkspace(current:Documents,changes:[Domain,unknown][]) {
  const issue=settlementGuard(current,changes) || baseballGuard(current,changes);
  if (issue) return issue;
  const updates=new Map(changes);
  const get=<K extends Domain>(key:K)=>(updates.get(key) ?? current[key]?.value ?? emptyData[key]) as WorkspaceData[K];
  const previous=(current.subscriptions?.value ?? emptyData.subscriptions) as WorkspaceData["subscriptions"];
  return subscriptionHistoryError(previous,get("subscriptions")) || subscriptionLinks(get("subscriptions"),get("records").finance,get("finance"),get("settlements"),get("baseball"));
}
