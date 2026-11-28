export const modules = {
  schedule: { title: "일정", description: "회의, 약속, 개인 일정을 관리하세요.", groups: ["개인", "업무"], unit: "" },
  tasks: { title: "할 일", description: "마감일과 진행 상태를 확인하세요.", groups: ["예정", "진행 중", "완료"], unit: "" },
  finance: { title: "가계부", description: "월별 수입과 지출 내역을 관리하세요.", groups: ["지출", "수입"], unit: "원" },
  inventory: { title: "냉장고", description: "보관 장소별 식재료와 소비기한을 확인하세요.", groups: ["냉장", "냉동", "실온"], unit: "개" },
  utilities: { title: "공과금", description: "청구 내역과 납부 상태를 확인하세요.", groups: ["미납", "납부"], unit: "원" },
  knowledge: { title: "메모", description: "기억할 내용을 기록하고 검색하세요.", groups: ["일반", "즐겨찾기"], unit: "" },
  learning: { title: "개발·학습", description: "프로젝트, 목표, 학습 기록을 관리하세요.", groups: ["프로젝트", "목표", "학습 기록"], unit: "" },
  analytics: { title: "생활 분석", description: "생활 기록과 모듈별 지표를 확인하세요.", groups: ["운동", "휴식", "기타"], unit: "분" },
} as const;

export type ModuleKey = keyof typeof modules;
export type Entry = { completed?:boolean; completedOn?:string; id: string; title: string; group: string; date: string; amount: number; detail: string };
export type Records = Record<ModuleKey, Entry[]>;

export function seoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function sampleRecords(day: string): Records {
  const entry = (id:string, title:string, group:string, amount = 0, detail = ""): Entry => ({id, title, group, date:day, amount, detail});
  return {
    schedule: [entry("s1","주간 계획 세우기","개인",0,"저녁에 다음 주 일정 정리")],
    tasks: [entry("t1","장보기 목록 정리","예정"),entry("t2","개발 환경 확인","완료")],
    finance: [entry("f1","식료품","지출",26500),entry("f2","예시 수입","수입",50000)],
    inventory: [entry("i1","사과","냉장",3),entry("i2","냉동 만두","냉동",1)],
    utilities: [entry("u1","전기 요금","미납",18300,"사용량 120 kWh")],
    knowledge: [entry("n1","일요일에 읽을 글","즐겨찾기",0,"Next.js App Router 공식 문서 #개발")],
    learning: [entry("l1","개인 AI 비서","프로젝트",0,"기본 화면 구성 · 진행률 20%"),entry("l2","TypeScript","학습 기록",0,"타입 좁히기 · 30분")],
    analytics: [entry("a1","저녁 산책","운동",25)],
  };
}

export function summarize(records: Records, month: string) {
  const transactions = records.finance.filter(row => row.date.startsWith(month));
  return {
    income: transactions.filter(row => row.group === "수입").reduce((total,row) => total + row.amount, 0),
    expense: transactions.filter(row => row.group === "지출").reduce((total,row) => total + row.amount, 0),
    open: records.tasks.filter(row => row.group !== "완료").length,
    completed: records.tasks.filter(row => row.group === "완료").length,
    unpaid: records.utilities.filter(row => row.group === "미납").reduce((total,row) => total + row.amount, 0),
    activity: records.analytics.reduce((total,row) => total + row.amount, 0),
  };
}
