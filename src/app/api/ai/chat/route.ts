import {authenticatedUserId, authEnabled} from "@/auth";
import {isSameOrigin} from "@/services/workspace-access";
import {conversation, MockProvider, OllamaProvider} from "@/lib/ai/provider";

export async function POST(request: Request) {
  if (authEnabled) {
    if (!(await authenticatedUserId())) return Response.json({error:"로그인이 필요합니다."},{status:401});
    if (!isSameOrigin(request.headers.get("origin"),process.env.AUTH_URL)) return Response.json({error:"요청 출처를 확인할 수 없습니다."},{status:403});
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({error:"JSON 요청이 필요합니다."},{status:415});
  }
  const input = conversation.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({error:"메시지를 확인해 주세요."},{status:400});
  const provider = authEnabled && process.env.AI_PROVIDER === "ollama"
    ? new OllamaProvider(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",process.env.OLLAMA_MODEL ?? "gemma3:4b")
    : new MockProvider();
  try {
    return Response.json({content:await provider.reply(input.data.messages,request.signal)});
  } catch {
    return Response.json({error:"AI에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."},{status:502});
  }
}
