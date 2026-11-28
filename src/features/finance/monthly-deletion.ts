import {z} from "zod";
import {validMonth} from "../utilities/model.ts";
import type {Subscriptions} from "../subscriptions/model.ts";
import type {Monthly} from "./model.ts";

const month = z.string().refine(validMonth);
export const monthlyDeletion = z.discriminatedUnion("mode",[
  z.strictObject({mode:z.literal("single"),month,ruleId:z.string().min(1).max(100),confirmPaid:z.literal(true).optional()}),
  z.strictObject({mode:z.literal("unpaid"),month}),
]);

export type MonthlyDeletion = z.infer<typeof monthlyDeletion>;

export function monthlyKey(row:Pick<Monthly,"month"|"ruleId">) {
  return row.month+":"+row.ruleId;
}

export function monthlyDeletionTargets(rows:Monthly[],target:MonthlyDeletion) {
  return rows.filter(row=>row.month===target.month && (target.mode==="single" ? row.ruleId===target.ruleId : row.paidOn===null));
}

export function monthlyDeletionBlock(row:Monthly,subscriptions:Subscriptions) {
  return subscriptions.payments.some(payment=>payment.fixedRuleId===row.ruleId && payment.fixedMonth===row.month)
    ? "구독 결제 이력에 연결된 납부 내역입니다. 구독 결제 이력에서 연결을 해제한 후 삭제할 수 있습니다."
    : "";
}

export function validateMonthlyDeletion(previous:Monthly[],next:Monthly[],subscriptions:Subscriptions,target?:MonthlyDeletion) {
  const remaining = new Set(next.map(monthlyKey));
  const removed = previous.filter(row=>!remaining.has(monthlyKey(row)));
  if (!target) return removed.length ? "월별 고정 지출 내역은 삭제 확인 후 삭제할 수 있습니다." : "";

  const requested = monthlyDeletionTargets(previous,target);
  const keys = new Set(requested.map(monthlyKey));
  if (!requested.length || removed.length!==requested.length || removed.some(row=>!keys.has(monthlyKey(row)))) {
    return "삭제 대상이 변경되었습니다. 월별 내역을 다시 확인해 주세요.";
  }
  for (const row of requested) {
    const block = monthlyDeletionBlock(row,subscriptions);
    if (block) return block;
    if (row.paidOn!==null && (target.mode!=="single" || !target.confirmPaid)) {
      return "실제 지출 집계에 반영된 납부 내역을 삭제하려면 별도로 확인해 주세요.";
    }
  }
  return "";
}
