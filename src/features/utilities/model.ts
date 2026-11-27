export const managementFields = {
  electricityUsage: { label:"전기 사용량", unit:"kWh" },
  electricity: { label:"전기요금", unit:"원" },
  sharedElectricity: { label:"공동 전기료", unit:"원" },
  television: { label:"TV 수신료", unit:"원" },
  waterUsage: { label:"수도 사용량", unit:"㎥" },
  water: { label:"수도요금", unit:"원" },
  base: { label:"기본 관리비", unit:"원" },
  total: { label:"관리비 합계", unit:"원" },
} as const;
export type ManagementKey = keyof typeof managementFields;
export const managementKeys = Object.keys(managementFields) as ManagementKey[];
type ManagementAmounts = Record<ManagementKey, number | null>;
export type Scope = "personal" | "reference";
type BillBase = {month:string; scope:Scope; note:string};
export type ManagementBill = BillBase & {kind:"management"} & ManagementAmounts;
export type GasBill = BillBase & {kind:"gas"; gas:number|null; start:string|null; end:string|null};
export type Bill = ManagementBill | GasBill;
export type Residence = {start:string|null;end:string|null};
export type UtilityState = {residence:Residence;bills:Bill[]};

export const scopeNames = {personal:"본인 사용 내역",reference:"참고용 내역"} as const;
export const kindNames = {management:"관리비",gas:"가스비"} as const;
export const missing = "—";

export function blankBill(kind: Bill["kind"], month: string, scope: Scope): Bill {
  const base = {month,scope,note:""};
  return kind === "gas" ? {...base,kind,gas:null,start:null,end:null} : {
    ...base,kind,electricityUsage:null,electricity:null,sharedElectricity:null,television:2500,
    waterUsage:null,water:null,base:null,total:null,
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

export function withinResidence(month:string, residence:Residence, period?:{start:string|null;end:string|null}) {
  if (!residence.start || !validMonth(month)) return false;
  const first = month+"-01";
  const [year, part] = month.split("-").map(Number);
  const last = month+"-"+new Date(Date.UTC(year,part,0)).getUTCDate();
  const dates = [first,last,period?.start,period?.end].filter(date=>date != null);
  return dates.every(date=>date >= residence.start! && (!residence.end || date <= residence.end));
}

export function effectiveScope(bill:Bill,residence:Residence):Scope {
  return bill.scope === "personal" && withinResidence(bill.month,residence,bill.kind === "gas" ? bill : undefined)
    ? "personal" : "reference";
}

export function validateBill(bill:Bill,residence:Residence): string[] {
  const errors:string[] = [];
  if (!validMonth(bill.month)) errors.push("청구월을 YYYY-MM으로 입력해 주세요.");
  if (bill.note.length > 1000) errors.push("비고는 1000자까지 입력할 수 있습니다.");
  if (bill.kind === "gas") {
    if ((bill.start !== null && !validDate(bill.start)) || (bill.end !== null && !validDate(bill.end))) errors.push("가스 사용일을 YYYY-MM-DD로 입력해 주세요.");
    if (bill.start && bill.end && bill.start > bill.end) errors.push("가스 사용 종료일은 시작일 이후여야 합니다.");
  }
  if (bill.scope === "personal" && effectiveScope(bill,residence) !== "personal") {
    errors.push("본인 사용 내역은 청구월 전체와 입력한 가스 사용일이 거주 기간 안에 있어야 합니다. 참고용으로 등록할 수 있습니다.");
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

export const billKey = (bill:Pick<Bill,"month"|"kind">) => bill.month+":"+bill.kind;
export function replaceBills(existing:Bill[], changes:Bill[]) {
  const next = new Map(existing.map(bill=>[billKey(bill),bill]));
  for (const bill of changes) next.set(billKey(bill),bill);
  return [...next.values()];
}

export function personalStatistics(bills:Bill[], residence:Residence) {
  const personal = bills.filter(bill=>effectiveScope(bill,residence) === "personal");
  const amounts = [...new Set(personal.map(bill=>bill.month))]
    .map(month=>housing(personal.filter(bill=>bill.month===month)).total)
    .filter(amount=>amount!==null);
  const total = sumMoney(amounts);
  return {total,average:total === null ? null : total/amounts.length,months:amounts.length};
}

export function comparison(bills:Bill[], month:string, residence:Residence, allowReference:boolean) {
  const monthly = bills.filter(bill=>bill.month===month);
  const own = housing(monthly.filter(bill=>effectiveScope(bill,residence)==="personal"));
  if (own.total !== null || !allowReference) return {...own,scope:"personal" as const};
  return {...housing(monthly.filter(bill=>effectiveScope(bill,residence)==="reference")),scope:"reference" as const};
}

export function sampleUtilities(today:string): UtilityState {
  const month = today.slice(0,7);
  const previous = shiftMonth(month,-1);
  const yearAgo = shiftMonth(month,-12);
  const examples = [[yearAgo,"reference",115000,0],[previous,"personal",120000,26500],[month,"personal",124800,31800]] as const;
  const bills:Bill[] = examples.flatMap(([month,scope,total,gas]):Bill[]=>[
    {month,scope,kind:"management",electricityUsage:148,electricity:24500,sharedElectricity:-1200,television:2500,
      waterUsage:7.5,water:10500,base:86500,total,note:"가상 관리비 예시"},
    {month,scope,kind:"gas",gas,start:null,end:null,note:"가상 가스비 예시"},
  ]);
  return {residence:{start:shiftMonth(month,-5)+"-01",end:null},bills};
}
