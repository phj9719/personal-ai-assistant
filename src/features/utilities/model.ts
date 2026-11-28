export const managementFields = {
  electricityUsage: { label:"전기 사용량", unit:"kWh" },
  electricity: { label:"전기요금", unit:"원" },
  sharedElectricity: { label:"공동 전기료", unit:"원" },
  television: { label:"TV 수신료", unit:"원" },
  waterUsage: { label:"수도 사용량", unit:"㎥" },
  water: { label:"수도요금", unit:"원" },
  base: { label:"기본 관리비", unit:"원" },
  parking: { label:"주차비", unit:"원" },
  total: { label:"관리비 고지서 합계", unit:"원" },
} as const;
export type ManagementKey = keyof typeof managementFields;
export const managementKeys = Object.keys(managementFields) as ManagementKey[];
type ManagementAmounts = Record<Exclude<ManagementKey,"parking">, number | null> & {parking?:number|null; parkingInBase?:boolean};
export type Scope = "personal" | "reference";
type BillBase = {month:string; scope:Scope; note:string};
export type ManagementBill = BillBase & {kind:"management"} & ManagementAmounts;
export type GasBill = BillBase & {kind:"gas"; gas:number|null; start:string|null; end:string|null};
export type Bill = ManagementBill | GasBill;
export type Residence = {start:string|null;end:string|null};
export type UtilityState = {residence:Residence;bills:Bill[]};

export const scopeNames = {personal:"실제 관리비",reference:"참고용 관리비"} as const;
export const kindNames = {management:"관리비",gas:"가스비"} as const;
export const missing = "—";

export function blankBill(kind: Bill["kind"], month: string, scope: Scope): Bill {
  const base = {month,scope,note:""};
  return kind === "gas" ? {...base,kind,gas:null,start:null,end:null} : {
    ...base,kind,electricityUsage:null,electricity:null,sharedElectricity:null,television:scope==="personal" ? 2500 : null,
    waterUsage:null,water:null,base:null,parking:null,parkingInBase:false,total:null,
  };
}

export function validMonth(value:string) {
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function validDate(value:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validMonth(value.slice(0,7))) return false;
  const timestamp = Date.parse(value+"T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value;
}

export function shiftMonth(month:string, shift:number) {
  const [year, part] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, part - 1 + shift, 1));
  return date.toISOString().slice(0,7);
}

export function withinResidence(month:string, residence:Residence) {
  if (!validMonth(month)) return false;
  const [year, part] = month.split("-").map(Number);
  const last = month+"-"+new Date(Date.UTC(year,part,0)).getUTCDate();
  return overlapsResidence(month+"-01",last,residence);
}

function overlapsResidence(start:string|null,end:string|null,residence:Residence) {
  return (!residence.start || !end || end>=residence.start) &&
    (!residence.end || !start || start<=residence.end);
}

export function residenceWarnings(bill:Bill,residence:Residence):string[] {
  if (bill.scope!=="personal") return [];
  const warnings:string[] = [];
  if (validMonth(bill.month) && !withinResidence(bill.month,residence)) warnings.push("청구월이 거주 기간과 겹치지 않습니다.");
  if (bill.kind==="gas" && (bill.start || bill.end) && !overlapsResidence(bill.start,bill.end,residence)) {
    warnings.push("가스 사용 기간이 거주 기간과 겹치지 않습니다.");
  }
  return warnings;
}

export function hasOutsideResidenceBills(value:unknown) {
  const data = value as UtilityState|null|undefined;
  if (!data?.residence || !Array.isArray(data.bills)) return false;
  return data.bills.some(bill=>bill?.scope==="personal" && typeof bill.month==="string" && residenceWarnings(bill,data.residence).length>0);
}

export function needsResidenceConfirmation(previous:UtilityState|undefined,next:UtilityState) {
  const existing = new Map(previous?.bills.map(bill=>[billKey(bill),bill]));
  return next.bills.some(bill=>{
    if (!residenceWarnings(bill,next.residence).length) return false;
    const old = existing.get(billKey(bill));
    if (!old || old.kind!==bill.kind || old.note!==bill.note) return true;
    return bill.kind==="management" && old.kind==="management"
      ? managementKeys.some(key=>(old[key] ?? null)!==(bill[key] ?? null)) || !!old.parkingInBase!==!!bill.parkingInBase
      : bill.kind==="gas" && old.kind==="gas" && (old.gas!==bill.gas || old.start!==bill.start || old.end!==bill.end);
  });
}

export function validateBill(bill:Bill): string[] {
  const errors:string[] = [];
  if (!validMonth(bill.month)) errors.push("청구월을 YYYY-MM으로 입력해 주세요.");
  if (bill.note.length > 1000) errors.push("비고는 1000자까지 입력할 수 있습니다.");
  if (bill.kind === "gas") {
    if ((bill.start !== null && !validDate(bill.start)) || (bill.end !== null && !validDate(bill.end))) errors.push("가스 사용일을 YYYY-MM-DD로 입력해 주세요.");
    if (bill.start && bill.end && bill.start > bill.end) errors.push("가스 사용 종료일은 시작일 이후여야 합니다.");
  }
  return errors;
}

export function parseNumber(raw:string,unit:"원"|"kWh"|"㎥",allowNegative=false):number|null {
  const value = raw.trim().normalize("NFKC");
  if (value === "" || /^(null|—|-)$/i.test(value)) return null;
  const allowed = unit === "원" ? "(?:원)?" : unit === "kWh" ? "(?:kWh)?" : "(?:m3|t)?";
  const parts = new RegExp("^([+−-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)\\s*(k)?\\s*"+allowed+"$","i").exec(value);
  if (!parts) throw new Error("숫자 또는 지원하는 단위를 입력해 주세요.");
  const amount = Number(parts[1].replaceAll(",","").replace("−","-")) * (parts[2] ? 1000 : 1);
  const scale = unit === "원" ? 100 : 1000;
  const rounded = Math.round(amount * scale) / scale;
  if ((!allowNegative && amount < 0) || Math.abs(amount) > (unit === "원" ? 999999999999.99 : 999999999.999) || Math.abs(amount - rounded) > Math.max(1e-9,Math.abs(amount) * Number.EPSILON)) {
    throw new Error(unit === "원" ? "허용 범위와 소수 둘째 자리까지 입력해 주세요." : "0 이상, 소수 셋째 자리까지 입력해 주세요.");
  }
  return rounded === 0 ? 0 : rounded;
}

export function sumMoney(values:(number|null)[]) {
  const known = values.filter(value=>value !== null);
  return known.length ? known.reduce((cents,value)=>cents+Math.round(value*100),0)/100 : null;
}

export function managementBreakdown(bill:ManagementBill) {
  const parts = [bill.electricity,bill.sharedElectricity,bill.television,bill.water,bill.base];
  if (!bill.parkingInBase) parts.push(bill.parking ?? null);
  const subtotal = sumMoney(parts);
  return {
    subtotal, complete:parts.every(value=>value !== null),
    difference: bill.total === null || subtotal === null ? null : sumMoney([bill.total,-subtotal]),
  };
}

export function housing(bills:Bill[]) {
  const management = bills.find(bill=>bill.kind === "management")?.total ?? null;
  const gas = bills.find(bill=>bill.kind === "gas")?.gas ?? null;
  return {total:sumMoney([management,gas]),complete:management !== null && gas !== null};
}

export const billKey = (bill:Pick<Bill,"month"|"kind"|"scope">) => bill.month+":"+bill.kind+":"+bill.scope;
export function replaceBills(existing:Bill[], changes:Bill[]) {
  const next = new Map(existing.map(bill=>[billKey(bill),bill]));
  for (const bill of changes) next.set(billKey(bill),bill);
  return [...next.values()];
}

export function personalStatistics(bills:Bill[]) {
  const personal = bills.filter(bill=>bill.scope === "personal");
  const amounts = [...new Set(personal.map(bill=>bill.month))]
    .map(month=>housing(personal.filter(bill=>bill.month===month)).total)
    .filter(amount=>amount!==null);
  const total = sumMoney(amounts);
  return {total,average:total === null ? null : total/amounts.length,months:amounts.length};
}

export function monthlyBills(bills:Bill[]) {
  const index = new Map<string,Bill[]>();
  for (const bill of bills) {
    const month = index.get(bill.month) ?? [];
    month.push(bill);
    index.set(bill.month,month);
  }
  return index;
}

export function selectBills(month:Bill[], scope:"all"|Scope) {
  // Keep gas and management together by scope. A personal gas-only row cannot hide a reference invoice.
  const preferred = month.find(bill=>bill.kind==="management" && bill.scope==="personal")
    ?? month.find(bill=>bill.kind==="management")
    ?? month.find(bill=>bill.scope==="personal") ?? month[0];
  return month.filter(bill=>bill.scope===(scope==="all" ? preferred?.scope : scope));
}

export function comparison(bills:Bill[], month:string, allowReference:boolean) {
  const group = selectBills(bills.filter(bill=>bill.month===month),allowReference ? "all" : "personal");
  return {...housing(group),scope:group[0]?.scope ?? "personal"};
}

export const comparisonFields = {
  ...managementFields,
  withoutParking:{label:"주차비 제외 관리비",unit:"원"},
  gas:{label:"가스요금",unit:"원"},
  housing:{label:"전체 주거비",unit:"원"},
  housingWithoutParking:{label:"주차비 제외 전체 주거비",unit:"원"},
} as const;

export type ComparisonKey = keyof typeof comparisonFields;

export function metrics(bills:Bill[]):Record<ComparisonKey,number|null> {
  const management = bills.find(bill=>bill.kind==="management");
  const gas = bills.find(bill=>bill.kind==="gas")?.gas ?? null;
  const total = management?.total ?? null;
  const parking = management?.parking ?? null;
  const withoutParking = total===null || parking===null ? null : sumMoney([total,-parking]);
  return {
    electricityUsage:management?.electricityUsage ?? null,electricity:management?.electricity ?? null,
    sharedElectricity:management?.sharedElectricity ?? null,television:management?.television ?? null,
    waterUsage:management?.waterUsage ?? null,water:management?.water ?? null,base:management?.base ?? null,
    parking,total,withoutParking,gas,housing:total===null || gas===null ? null : sumMoney([total,gas]),
    housingWithoutParking:withoutParking===null || gas===null ? null : sumMoney([withoutParking,gas]),
  };
}

export function change(current:number|null,previous:number|null) {
  if (current===null || previous===null) return {difference:null,rate:null};
  return {difference:(Math.round(current*1000)-Math.round(previous*1000))/1000,
    rate:previous===0 ? null : (current-previous)/previous*100};
}

export function yearComparison(index:Map<string,Bill[]>,year:string,scope:"all"|Scope,metric:ComparisonKey) {
  return Array.from({length:12},(_,indexMonth)=>{
    const suffix = "-"+String(indexMonth+1).padStart(2,"0");
    const month = year+suffix;
    return {month:suffix.slice(1)+"월", current:metrics(selectBills(index.get(month) ?? [],scope))[metric],
      previous:metrics(selectBills(index.get(shiftMonth(month,-12)) ?? [],"all"))[metric]};
  });
}

export function sampleUtilities(today:string): UtilityState {
  const month = today.slice(0,7);
  const previous = shiftMonth(month,-1);
  const yearAgo = shiftMonth(month,-12);
  const examples = [[yearAgo,"reference",115000,0],[previous,"personal",120000,26500],[month,"personal",124800,31800]] as const;
  const bills:Bill[] = examples.flatMap(([month,scope,total,gas]):Bill[]=>[
    {month,scope,kind:"management",electricityUsage:148,electricity:24500,sharedElectricity:-1200,television:2500,
      waterUsage:7.5,water:10500,base:86500,parking:scope==="reference" ? 8000 : 0,total,note:"가상 관리비 예시"},
    {month,scope,kind:"gas",gas,start:null,end:null,note:"가상 가스비 예시"},
  ]);
  return {residence:{start:shiftMonth(month,-5)+"-01",end:null},bills};
}
