import { z } from "zod";

export const conversation = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  })).min(1).max(10).refine(messages => messages.at(-1)?.role === "user"),
});

type Message = z.infer<typeof conversation>["messages"][number];

export interface AIProvider {
  reply(messages: Message[], signal: AbortSignal): Promise<string>;
}

export class MockProvider implements AIProvider {
  async reply(messages: Message[]) {
    const prompt = messages.at(-1)?.content ?? "";
    if (prompt.includes("일정")) return "가상 일정은 왼쪽 일정 메뉴에서 확인할 수 있어요.";
    if (prompt.includes("할 일")) return "할 일 화면에서 가상 항목을 추가하거나 완료할 수 있어요.";
    if (prompt.includes("지출")) return "가계부에서 월별 가상 수입과 지출을 확인할 수 있어요.";
    return "가상 데이터 모드입니다. 일정, 할 일, 가계부 메뉴에서 항목을 확인하고 관리할 수 있어요.";
  }
}

const ollamaResponse = z.object({message: z.object({content: z.string().trim().min(1).max(2000)})});

export class OllamaProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async reply(messages: Message[], signal: AbortSignal) {
    const response = await fetch(new URL("/api/chat", this.baseUrl), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({model: this.model, stream: false, messages: [
        {role:"system",content:"한국어 개인 비서입니다. 실제 저장 데이터에는 접근할 수 없으며 데이터 변경을 수행할 수 없습니다."},
        ...messages,
      ]}),
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
    });
    if (!response.ok) throw new Error("Ollama 요청 실패");
    return ollamaResponse.parse(await response.json()).message.content;
  }
}
