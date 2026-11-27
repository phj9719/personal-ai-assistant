import { authenticatedUserId,authEnabled } from "@/auth";
import { readDocuments,saveWorkspace } from "@/services/workspace";
import { isSameOrigin } from "@/services/workspace-access";

const noStore = {"Cache-Control":"no-store"};
const sizeLimit = 4*1024*1024;
const json = (value:unknown,status:number)=>Response.json(value,{status,headers:noStore});
const problem = (error:string,status:number)=>json({error},status);

export async function GET() {
  if (!authEnabled) return problem("데모에서는 브라우저 저장을 사용합니다.",404);
  const user = await authenticatedUserId();
  if (!user) return problem("로그인이 필요합니다.",401);
  try { return json({documents:await readDocuments(user)},200); }
  catch { return problem("데이터베이스에서 데이터를 불러오지 못했습니다.",503); }
}

async function requestBody(request:Request) {
  if (Number(request.headers.get("content-length"))>sizeLimit) return {status:413} as const;
  const reader = request.body?.getReader();
  if (!reader) return {status:400} as const;
  const decoder = new TextDecoder("utf-8",{fatal:true});
  let bytes=0;
  let text="";
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes>sizeLimit) {
        await reader.cancel();
        return {status:413} as const;
      }
      text += decoder.decode(value,{stream:true});
    }
    return {status:200,body:JSON.parse(text+decoder.decode()) as unknown} as const;
  } catch { return {status:400} as const; }
  finally { reader.releaseLock(); }
}

export async function POST(request:Request) {
  if (!authEnabled) return problem("데모에서는 브라우저 저장을 사용합니다.",404);
  const user = await authenticatedUserId();
  if (!user) return problem("로그인이 필요합니다.",401);
  if (!isSameOrigin(request.headers.get("origin"),process.env.AUTH_URL)) return problem("요청 출처를 확인할 수 없습니다.",403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") return problem("JSON 요청이 필요합니다.",415);
  const parsed = await requestBody(request);
  if (parsed.status!==200) return problem(parsed.status===413 ? "요청 데이터가 4 MiB 제한을 넘었습니다." : "요청 내용을 읽을 수 없습니다.",parsed.status);
  try {
    const result = await saveWorkspace(user,parsed.body);
    return "documents" in result ? json({documents:result.documents},result.status) : problem(result.error,result.status);
  } catch { return problem("데이터베이스 저장에 실패했습니다. 다시 시도해 주세요.",503); }
}
