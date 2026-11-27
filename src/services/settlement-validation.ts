import {z} from "zod";
import {validDate} from "../features/utilities/model.ts";
import {caseError, linkedError, type Settlements} from "../features/settlements/model.ts";
import {emptyData,type Documents,type Domain,type WorkspaceData} from "../features/workspace/data.ts";

const id = z.string().min(1).max(100);
const date = z.string().refine(validDate);
const title = z.string().trim().min(1).max(100);
const note = z.string().max(1000);
const account = z.string().max(150);
const amount = z.number().int().min(0).max(999999999);
const positive = amount.min(1);
const payment = {id,title,date,amount:positive,account,entryId:id.nullable()};
const receipt = z.strictObject({id,personId:id,date,amount:positive,account,note,entryId:id.nullable(),quick:z.literal(true).optional()});
const common = {
  id,title,date,note,own:amount,
  payments:z.array(z.strictObject({...payment,method:z.enum(["transfer","card"])})).min(1).max(100),
  debits:z.array(z.strictObject(payment)).max(300),
  receipts:z.array(receipt).max(500),
};
const oneCase = z.discriminatedUnion("kind",[
  z.strictObject({...common,kind:z.literal("split"),due:date.nullable(),people:z.array(z.strictObject({id,name:title,share:amount})).min(1).max(100)}),
  z.strictObject({...common,kind:z.literal("advance"),name:title,target:amount.nullable(),cardInstallments:z.number().int().min(1).max(120).nullable(),
    repayment:z.enum(["single","regular","free"]),start:date.nullable(),end:date.nullable(),planAmount:amount.nullable(),
    plans:z.array(z.strictObject({id,date:date.nullable(),amount:amount.nullable()})).max(600),
    adjustments:z.array(z.strictObject({id,date,amount:positive,kind:z.enum(["waive","assume"]),note})).max(500)}),
]);

export const settlementsSchema = z.array(oneCase).max(1500).refine(items=>{
  const ids = new Set<string>();
  for (const item of items) {
    if (caseError(item)) return false;
    const nested = item.kind==="split" ? item.people : [...item.adjustments,...item.plans];
    for (const row of [item,...item.payments,...item.debits,...item.receipts,...nested]) {
      if (ids.has(row.id)) return false;
      ids.add(row.id);
    }
  }
  return true;
},"금액이 맞지 않거나 중복된 정산·대납 항목이 있습니다.");

export function settlementGuard(current:Documents, changes:[Domain,unknown][]) {
  if (!changes.some(([domain])=>domain==="settlements" || domain==="records")) return "";
  const changed = new Map(changes);
  const cases = (changed.get("settlements") ?? current.settlements?.value ?? emptyData.settlements) as Settlements;
  const records = (changed.get("records") ?? current.records?.value ?? emptyData.records) as WorkspaceData["records"];
  return linkedError(cases,records.finance);
}
