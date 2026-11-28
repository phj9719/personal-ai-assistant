import Papa from "papaparse";
import {
  billKey, blankBill, kindNames, managementFields, managementKeys, parseNumber, residenceWarnings, scopeNames, validateBill,
  type Bill, type Residence, type Scope,
} from "./model.ts";

const labels = {
  month:"청구월",kind:"구분",scope:"데이터 유형",
  ...Object.fromEntries(managementKeys.map(key=>[key,managementFields[key].label])),
  parkingInBase:"기본 관리비에 주차비 포함",gas:"가스요금",start:"가스비 사용 시작일",end:"가스비 사용 종료일",note:"비고",
} as Record<string,string>;
const gasKeys = ["gas","start","end","period"];
const names = new Map(Object.entries(labels).flatMap(([key,label])=>[[key.toLowerCase(),key],[label,key]]));
for (const [label,key] of Object.entries({
  "가스비":"gas","사용 구분":"scope","관리비 합계":"total","전기사용량":"electricityUsage","전기료":"electricity","수도료":"water",
  "가스비 사용 기간":"period","가스 사용 기간":"period",
})) names.set(label,key);

type PreviewRow = {line:number;bill:Bill|null;errors:string[];warnings:string[];duplicate:boolean};

export function importBills(source:string,existing:Bill[],residence:Residence,bulkScope?:Scope) {
  if (!source.trim()) throw new Error("가져올 표를 입력해 주세요.");
  if (source.length > 500_000) throw new Error("한 번에 500KB까지 가져올 수 있습니다.");
  const input = source.trimStart().replace(/^\uFEFF/,"");
  let grid:string[][];
  if (input.startsWith("|") || input.split(/\r?\n/)[1]?.includes("---|")) {
    grid = input.trimEnd().split(/\r?\n/)
      .filter(line=>line.trim())
      .map(line=>line.trim().replace(/^\||\|$/g,"").split(/(?<!\\)\|/).map(cell=>cell.replaceAll("\\|","|").trim()))
      .filter(line=>!line.every(cell=>/^:?-{3,}:?$/.test(cell)));
  } else {
    const result = Papa.parse<string[]>(input,{delimiter:input.split(/\r?\n/,1)[0].includes("\t") ? "\t" : ",",skipEmptyLines:"greedy"});
    if (result.errors.length) throw new Error("표 형식을 읽을 수 없습니다. CSV의 따옴표와 구분자를 확인해 주세요.");
    grid = result.data;
  }
  const header = grid.shift() ?? [];
  const keys = header.map(cell=>names.get(cell.normalize("NFKC").trim().replace(/\s*\([^)]*\)\s*$/,"").toLowerCase()) ?? "");
  if (!keys.includes("month")) throw new Error("첫 행에 청구월 제목이 필요합니다.");
  const recognized = keys.filter(Boolean);
  if (new Set(recognized).size !== recognized.length) throw new Error("같은 열 제목을 두 번 사용할 수 없습니다.");
  if (!grid.length || grid.length > 1200) throw new Error("가져올 데이터는 1~1200행이어야 합니다.");

  const previous = new Map(existing.map(bill=>[billKey(bill),bill]));
  const seen = new Set<string>();
  return grid.flatMap((row,index):PreviewRow[]=>{
    const line = index+2;
    const invalid = (message:string):PreviewRow[]=>[{line,bill:null,errors:[message],duplicate:false,warnings:[]}];
    if (row.length !== keys.length) return invalid("머리글과 열 수가 다릅니다. CSV에서 천 단위 쉼표가 있는 값은 따옴표로 감싸 주세요.");
    const data = new Map(keys.map((key,column)=>[key,row[column].trim()]));
    const month = data.get("month") ?? "";
    const rawKind = data.get("kind");
    const rawScope = data.get("scope");
    const rowScope = rawScope === "personal" || rawScope === scopeNames.personal || rawScope === "본인 사용 내역" ? "personal" :
      rawScope === "reference" || rawScope === scopeNames.reference || rawScope === "참고용 내역" ? "reference" : undefined;
    if (!bulkScope && rawScope && !rowScope) return invalid("데이터 유형은 실제 관리비 또는 참고용 관리비여야 합니다.");
    const hasManagement = [...managementKeys,"parkingInBase"].some(key=>Boolean(data.get(key)));
    const hasGas = gasKeys.some(key=>Boolean(data.get(key)));
    let kinds:Bill["kind"][];
    if (rawKind) {
      if (rawKind === "management" || rawKind === kindNames.management) kinds = ["management"];
      else if (rawKind === "gas" || rawKind === kindNames.gas) kinds = ["gas"];
      else return invalid("구분은 관리비 또는 가스비여야 합니다.");
      if ((kinds[0] === "gas" && hasManagement) || (kinds[0] === "management" && hasGas)) return invalid("구분과 다른 종류의 청구 항목이 입력되었습니다.");
    } else {
      kinds = [...(hasManagement ? ["management" as const] : []),...(hasGas ? ["gas" as const] : [])];
      if (!kinds.length) return invalid("등록할 항목 또는 관리비·가스비 구분을 입력해 주세요.");
    }
    return kinds.map(kind=>{
      const personal = previous.get(billKey({month,kind,scope:"personal"}));
      const reference = previous.get(billKey({month,kind,scope:"reference"}));
      const specified = bulkScope ?? rowScope;
      const ambiguous = !specified && personal && reference;
      const scope = specified ?? personal?.scope ?? "reference";
      const key = billKey({month,kind,scope});
      const old = previous.get(key);
      const bill = {...(old ?? blankBill(kind,month,scope))};
      const errors:string[] = [];
      if (ambiguous) errors.push("이 청구월에 실제·참고용 내역이 모두 있습니다. 데이터 유형을 지정해 주세요.");
      if (seen.has(key)) errors.push("표에 청구월·청구 종류·데이터 유형이 같은 행이 두 번 있습니다.");
      seen.add(key);
      if (data.has("note")) bill.note = (data.get("note") ?? "").replace(/^'(?=[=+\-@\t\r＝＋－＠])/,"");
      if (bill.kind === "management") {
        for (const field of managementKeys) {
          if (!data.has(field)) continue;
          const {label,unit} = managementFields[field];
          try { bill[field] = parseNumber(data.get(field) ?? "",unit,field==="sharedElectricity"); }
          catch (error) { errors.push(label+" · "+(error as Error).message); }
        }
        if (data.has("parkingInBase")) {
          const flag = (data.get("parkingInBase") ?? "").toLowerCase();
          if (["예","true","1"].includes(flag)) bill.parkingInBase = true;
          else if (["","아니오","아니요","false","0"].includes(flag)) bill.parkingInBase = false;
          else errors.push("기본 관리비에 주차비 포함은 예 또는 아니오로 입력해 주세요.");
        }
      } else {
        const period = data.get("period");
        if (period) {
          const match = /^(\d{4}-\d{2}-\d{2})?\s*[~～]\s*(\d{4}-\d{2}-\d{2})?$/.exec(period);
          if (!match || data.has("start") || data.has("end")) errors.push("가스 사용 기간은 YYYY-MM-DD ~ YYYY-MM-DD로 입력하거나 시작일·종료일 열을 사용해 주세요.");
          else {bill.start = match[1] || null;bill.end = match[2] || null;}
        } else if (data.has("period")) {bill.start = null;bill.end = null;}
        try { if (data.has("gas")) bill.gas = parseNumber(data.get("gas") ?? "","원"); }
        catch (error) { errors.push("가스요금 · "+(error as Error).message); }
        if (data.has("start")) bill.start = data.get("start") || null;
        if (data.has("end")) bill.end = data.get("end") || null;
      }
      return {line,bill,errors:[...errors,...validateBill(bill)],warnings:residenceWarnings(bill,residence),duplicate:old !== undefined};
    });
  });
}

export function exportBills(bills:Bill[]) {
  const fields = Object.keys(labels);
  return "\uFEFF"+Papa.unparse([Object.values(labels),...bills.map(bill=>fields.map(key=>{
    if (key === "kind") return kindNames[bill.kind];
    if (key === "scope") return scopeNames[bill.scope];
    if (key === "parkingInBase") return bill.kind==="management" && bill.parkingInBase ? "예" : "";
    if (key === "note") return /^[=+\-@\t\r＝＋－＠]/.test(bill.note) ? "'"+bill.note : bill.note;
    return bill[key as keyof typeof bill] ?? "";
  }))]);
}
