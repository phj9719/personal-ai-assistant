import {ProviderError} from "./provider.ts";

const failures = {
  timeout:{status:504,message:"AI 응답 대기 시간이 지났습니다. 잠시 후 같은 메시지로 다시 시도해 주세요."},
  cancelled:{status:499,message:"AI 응답을 취소했습니다."},
  connection:{status:503,message:"AI 서버에 연결할 수 없습니다. Ollama가 시작하거나 업데이트 중이면 잠시 후 다시 시도해 주세요."},
  unavailable:{status:503,message:"AI 서버가 아직 응답할 수 없습니다. 시작 또는 업데이트가 끝난 뒤 다시 시도해 주세요."},
  model:{status:502,message:"AI 모델을 불러오지 못했습니다. Ollama에서 설정된 모델을 확인해 주세요."},
  response:{status:502,message:"AI 서버에서 올바른 답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요."},
};

export const aiBudget = (setting:string|undefined)=>{
  const value = Number(setting);
  return Number.isInteger(value) && value>=1000 && value<=120000 ? value : 25000;
};

export function aiFailure(error:unknown,interruption?:"timeout"|"cancelled") {
  const reason = interruption ?? (error instanceof ProviderError ? error.reason : "response");
  return {reason,...failures[reason],upstreamStatus:error instanceof ProviderError ? error.upstreamStatus : undefined};
}
