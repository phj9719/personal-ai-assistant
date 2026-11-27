import { DocumentConstraint,importDocuments,readDocuments,writeDocument } from "../repositories/workspace";
import {baseballGuard} from "./baseball-validation";
import {settlementGuard} from "./settlement-validation";
import { domains, type Domain,type Documents } from "../features/workspace/data";
import { importRequest, parseDocument, writeRequest } from "./workspace-validation";

export {readDocuments};

export async function saveWorkspace(userId:string,body:unknown) {
  try { return await persist(userId,body); }
  catch (error) {
    if (error instanceof DocumentConstraint) return {status:422,error:error.message} as const;
    throw error;
  }
}

async function persist(userId:string,body:unknown) {
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
    const documents = await importDocuments(userId,entries,guardWorkspace);
    return documents ? {status:200,documents} as const :
      {status:409,error:"대상 영역에 데이터가 있거나 이전에 가져오기를 완료했습니다. 기존 데이터는 유지됩니다."} as const;
  }
  const update = writeRequest.safeParse(body);
  if (!update.success) return {status:400,error:"저장 요청 형식을 확인해 주세요."} as const;
  const {domain,revision,value} = update.data;
  const document = parseDocument(domain,value);
  if (!document.success) return {status:400,error:"유효하지 않거나 중복된 데이터가 있습니다."} as const;
  const saved = await writeDocument(userId,domain,revision,document.data,guardWorkspace);
  return saved ? {status:200,documents:{[domain]:saved}} as const :
    {status:409,error:"다른 탭에서 데이터가 변경되었습니다. 최신 데이터를 불러왔으니 확인 후 다시 시도해 주세요."} as const;
}

function guardWorkspace(current:Documents,changes:[Domain,unknown][]) {
  return settlementGuard(current,changes) || baseballGuard(current,changes);
}
