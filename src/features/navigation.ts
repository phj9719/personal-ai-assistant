import { AudioLines, NotebookTabs, Goal, CalendarDays, ChartNoAxesCombined, CircleCheck, CodeXml, House, NotebookPen, ReceiptText, Refrigerator, Settings2, Wallet } from "lucide-react";
import { modules } from "./modules";

export const screens = {
  assistant: {title:"AI 비서",icon:AudioLines},
  dashboard: {title:"대시보드",icon:House},
  schedule: {title:modules.schedule.title,icon:CalendarDays},
  tasks: {title:modules.tasks.title,icon:CircleCheck},
  finance: {title:modules.finance.title,icon:Wallet},
  inventory: {title:modules.inventory.title,icon:Refrigerator},
  utilities: {title:modules.utilities.title,icon:ReceiptText},
  knowledge: {title:modules.knowledge.title,icon:NotebookPen},
  learning: {title:modules.learning.title,icon:CodeXml},
  analytics: {title:modules.analytics.title,icon:ChartNoAxesCombined},
  life: {title:"일상 기록",icon:NotebookTabs},
  baseball: {title:"야구",icon:Goal},
  settings: {title:"설정",icon:Settings2},
};
