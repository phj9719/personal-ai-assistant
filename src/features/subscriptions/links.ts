import type {Entry} from "../modules";
import type {FinanceState} from "../finance/model";
import {linkedIds,type Settlements} from "../settlements/model.ts";
import type {Baseball} from "../baseball/model";
import {paidWon,type Subscriptions} from "./model.ts";

export function subscriptionLinks(data:Subscriptions,ledger:Entry[],finance:FinanceState,settlements:Settlements,baseball:Baseball) {
  const accounts=new Set(finance.accounts.map(row=>row.id));
  const rules=new Map(finance.rules.map(row=>[row.id,row]));
  const records=new Map(ledger.map(row=>[row.id,row]));
  const reserved=linkedIds(settlements);
  for (const row of baseball.tickets) if (row.entryId) reserved.add(row.entryId);
  const serviceMap=new Map(data.services.map(row=>[row.id,row]));
  const activeRules=new Set<string>();
  const fixedPayments=new Set<string>();
  for (const service of data.services) {
    if (service.accountId && !accounts.has(service.accountId)) return "구독에 연결된 결제수단을 찾을 수 없습니다.";
    if (service.ruleId) {
      const rule=rules.get(service.ruleId);
      if (!rule || rule.purpose!=="consumption" || rule.utility || activeRules.has(service.ruleId)) return "고정지출은 일반 소비의 미연결 설정만 구독 한 개에 연결할 수 있습니다.";
      activeRules.add(service.ruleId);
    }
  }
  for (const row of data.payments) {
    if (row.accountId && !accounts.has(row.accountId)) return "결제 이력에 연결된 결제수단을 찾을 수 없습니다.";
    if (row.entryId) {
      const entry=records.get(row.entryId);
      if (!entry || entry.group!=="지출" || reserved.has(row.entryId) || entry.date!==row.paidOn || entry.amount!==paidWon(row)) {
        return "같은 날짜와 원화 금액의 미연결 지출만 구독 결제에 연결할 수 있습니다.";
      }
      reserved.add(row.entryId);
    }
    const ruleId=serviceMap.get(row.serviceId)?.ruleId;
    if (row.fixedMonth) {
      const key=row.fixedRuleId+":"+row.fixedMonth;
      const match=finance.monthly.find(item=>item.ruleId===row.fixedRuleId && item.month===row.fixedMonth);
      if (!match || fixedPayments.has(key) || match.paidOn!==row.paidOn || match.paidAmount!==paidWon(row)) return "납부일과 원화 금액이 일치하는 고정지출 이력이 필요합니다.";
      fixedPayments.add(key);
    }
    if ((row.posted || row.entryId) && ruleId && finance.monthly.some(item=>item.ruleId===ruleId && item.paidOn &&
       (item.month===row.due.slice(0,7) || item.paidOn===row.paidOn))) return "같은 달의 고정지출 납부 내역이 있습니다. 그 납부 내역에 연결해 주세요.";
  }
  return "";
}

export function subscriptionHistoryError(before:Subscriptions,after:Subscriptions) {
  const stored=new Map(after.payments.map(row=>[row.id,row]));
  for (const row of before.payments) {
    const next=stored.get(row.id);
    if (!next || next.serviceId!==row.serviceId || next.due!==row.due || next.plan!==row.plan ||
      next.expected!==row.expected || next.currency!==row.currency || next.expectedRate!==row.expectedRate) {
      return "저장된 결제의 예정일과 당시 요금제·예상액은 보존해야 합니다. 실제 결제 상태와 금액은 수정할 수 있습니다.";
    }
  }
  return "";
}
