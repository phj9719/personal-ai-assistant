import {z} from "zod";
import {modules} from "../features/modules.ts";
import {billKey, validateBill, validDate, validMonth} from "../features/utilities/model.ts";
import {readPeriod, validateRule} from "../features/finance/model.ts";
import {domains, type Domain, type WorkspaceData} from "../features/workspace/data.ts";

const id = z.string().min(1).max(100);
const title = z.string().trim().min(1).max(100);
const description = z.string().max(1000);
const date = z.string().refine(validDate);
const month = z.string().refine(validMonth);
const decimal = (max:number,places:number,min=0)=>z.number().min(min).max(max).refine(value=>{
  const scaled=value*10**places;
  return Math.abs(scaled-Math.round(scaled)) < Math.max(1e-7,Math.abs(scaled)*Number.EPSILON);
});
const money = decimal(999999999999.99,2);
const quantity = decimal(999999999.999,3);
const purpose = z.enum(["consumption","savings","investment"]);
const timing = z.enum(["exact","approximate","unspecified"]);
const utility = z.enum(["management","gas"]).nullable();
const payment = z.strictObject({accountId:id.nullable(),method:z.enum(["transfer","debit","card"])});
const quote = z.strictObject({mode:z.enum(["fixed","variable","daily"]),amount:money.nullable(),min:money.nullable(),max:money.nullable()})
  .refine(({mode,amount,min,max})=>mode==="variable"
    ? (min===null && max===null || min!==null && max!==null && min<=max && (amount===null || amount>=min && amount<=max))
    : amount!==null && min===null && max===null);
const rule = z.strictObject({
  id,title,purpose,payment,quote,timing,day:z.number().int().min(1).max(31).nullable(),start:date,end:date.nullable(),
  active:z.boolean(),archived:z.boolean().optional(),utility,
});
const monthly = z.strictObject({
  ruleId:id,month,title,purpose,payment,quote,timing,due:date.nullable(),utility,
  periodStart:date,periodEnd:date,paidOn:date.nullable(),paidAmount:money.nullable(),
});
const account = z.strictObject({id,name:title,institution:title,kind:z.enum(["bank","card"]),archived:z.boolean().optional()});
const transfer = z.strictObject({id,title,date,amount:money.refine(value=>value>0),purpose:z.enum(["savings","investment"]),payment});

function unique<T>(items:T[], key:(item:T)=>string) {
  return new Set(items.map(key)).size===items.length;
}

const finance = z.strictObject({
  accounts:z.array(account).max(1000),rules:z.array(rule).max(2000),monthly:z.array(monthly).max(12000),transfers:z.array(transfer).max(12000),
}).refine(({accounts,rules,monthly,transfers})=>{
  if (!unique(accounts,row=>row.id) || !unique(rules,row=>row.id) || !unique(transfers,row=>row.id)
    || !unique(monthly,row=>row.month+":"+row.ruleId) || !unique(monthly.filter(row=>row.utility),row=>row.month+":"+row.utility)) return false;
  const byAccount = new Map(accounts.map(row=>[row.id,row]));
  const validPayment = ({accountId,method}:z.infer<typeof payment>)=> {
    if (!accountId) return true;
    const linked = byAccount.get(accountId);
    return !!linked && (linked.kind==="card")===(method==="card");
  };
  const rulesById = new Set(rules.map(row=>row.id));
  return rules.every(row=>!validateRule(row,rules) && (row.timing==="unspecified")===(row.day===null) && validPayment(row.payment))
    && monthly.every(row=>rulesById.has(row.ruleId) && validPayment(row.payment) && (row.paidOn===null)===(row.paidAmount===null)
      && (row.timing==="unspecified")===(row.due===null) && (!row.due || row.due.startsWith(row.month))
      && (!row.utility || row.purpose==="consumption") && readPeriod(row.periodStart,row.periodEnd))
    && transfers.every(row=>validPayment(row.payment));
});

const residence = z.strictObject({start:date.nullable(),end:date.nullable()})
  .refine(({start,end})=>end===null || start!==null && start<=end);
const billBase = {month,scope:z.enum(["personal","reference"]),note:description};
const bill = z.discriminatedUnion("kind",[
  z.strictObject({...billBase,kind:z.literal("management"),electricityUsage:quantity.nullable(),electricity:money.nullable(),
    sharedElectricity:decimal(999999999999.99,2,-999999999999.99).nullable(),television:money.nullable(),
    waterUsage:quantity.nullable(),water:money.nullable(),base:money.nullable(),total:money.nullable()}),
  z.strictObject({...billBase,kind:z.literal("gas"),gas:money.nullable(),start:date.nullable(),end:date.nullable()}),
]);
const utilities = z.strictObject({residence,bills:z.array(bill).max(12000)})
  .refine(value=>unique(value.bills,billKey) && value.bills.every(row=>!validateBill(row,value.residence).length));

function entries(module:keyof typeof modules) {
  const config = modules[module];
  const amount = config.unit==="원" ? money : quantity;
  return z.array(z.strictObject({
    id,title,group:z.string().refine(value=>(config.groups as readonly string[]).includes(value)),date,amount,detail:description,
  })).max(15000).refine(rows=>unique(rows,row=>row.id) && (module!=="finance" || rows.every(row=>row.amount>0)));
}
const records = z.strictObject({
  schedule:entries("schedule"),tasks:entries("tasks"),finance:entries("finance"),inventory:entries("inventory"),
  utilities:entries("utilities"),knowledge:entries("knowledge"),learning:entries("learning"),analytics:entries("analytics"),
});
const chat = z.array(z.strictObject({
  id,title,messages:z.array(z.strictObject({role:z.enum(["user","assistant"]),content:z.string().trim().min(1).max(2000)})).max(5000),
})).max(1000).refine(rows=>unique(rows,row=>row.id));

const schemas = {
  records,utilities,finance,chat,memories:z.array(z.string().trim().min(1).max(300)).max(2000),
  theme:z.enum(["light","dark"]),
} satisfies {[K in Domain]:z.ZodType<WorkspaceData[K]>};

export const writeRequest = z.strictObject({domain:z.enum(domains),revision:z.number().int().min(0).max(2147483646),value:z.unknown()});
export const importRequest = z.strictObject({kind:z.literal("import"),confirmed:z.literal(true),data:z.partialRecord(z.enum(domains),z.unknown())});
export function parseDocument(domain:Domain,value:unknown) {
  return schemas[domain].safeParse(value);
}
