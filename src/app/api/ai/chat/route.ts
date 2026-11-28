import {authenticatedUserId, authEnabled} from "@/auth";
import {isSameOrigin} from "@/services/workspace-access";
import {aiBudget,aiFailure} from "@/lib/ai/failure";
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
  const useOllama = authEnabled && process.env.AI_PROVIDER === "ollama";
  const provider = useOllama
    ? new OllamaProvider(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",process.env.OLLAMA_MODEL ?? "gemma3:4b")
    : new MockProvider();
  const started = performance.now();
  const deadline = AbortSignal.timeout(aiBudget(process.env.AI_TIMEOUT_MS));
  const signal = AbortSignal.any([request.signal,deadline]);
  try {
    return Response.json({content:await provider.reply(input.data.messages,signal)});
  } catch (error) {
    const interruption = signal.aborted ? (signal.reason===deadline.reason && deadline.aborted ? "timeout" : "cancelled") : undefined;
    const failure = aiFailure(error,interruption);
    console.warn("AI chat request failed",{
      provider:useOllama ? "ollama" : "mock",
      reason:failure.reason,durationMs:Math.round(performance.now()-started),upstreamStatus:failure.upstreamStatus,
    });
    return Response.json({error:failure.message},{status:failure.status});
  }
}
