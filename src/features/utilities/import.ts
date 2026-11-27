import Papa from "papaparse";
import {
  billKey, blankBill, kindNames, managementFields, managementKeys, parseNumber, scopeNames, validateBill,
  type Bill, type Residence,
} from "./model.ts";

const labels = {
  month:"청구월",kind:"구분",scope:"사용 구분",
  ...Object.fromEntries(managementKeys.map(key=>[key,managementFields[key].label])),
  gas:"가스요금",start:"가스비 사용 시작일",end:"가스비 사용 종료일",note:"비고",
} as Record<string,string>;
const gasKeys = ["gas","start","end"];
const names = new Map(Object.entries(labels).flatMap(([key,label])=>[[key.toLowerCase(),key],[label,key]]));
names.set("가스비","gas");
type PreviewRow = {line:number;bill:Bill|null;errors:string[];duplicate:boolean};

export function importBills(source:string,existing:Bill[],residence:Residence) {
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
    const invalid = (message:string):PreviewRow[]=>[{line,bill:null,errors:[message],duplicate:false}];
    if (row.length !== keys.length) return invalid("머리글과 열 수가 다릅니다. CSV에서 천 단위 쉼표가 있는 값은 따옴표로 감싸 주세요.");
    const data = new Map(keys.map((key,column)=>[key,row[column].trim()]));
    const month = data.get("month") ?? "";
    const rawKind = data.get("kind");
    const rawScope = data.get("scope");
    const scope = rawScope === "personal" || rawScope === scopeNames.personal ? "personal" :
      rawScope === "reference" || rawScope === scopeNames.reference ? "reference" : undefined;
    if (rawScope && !scope) return invalid("사용 구분은 본인 사용 내역 또는 참고용 내역이어야 합니다.");
    const hasManagement = managementKeys.some(key=>Boolean(data.get(key)));
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
      const key = billKey({month,kind});
      const old = previous.get(key);
      const bill = {...(old ?? blankBill(kind,month,"reference"))};
      const errors:string[] = [];
      if (seen.has(key)) errors.push("가져올 표에 같은 청구월과 종류가 두 번 있습니다.");
      seen.add(key);
      if (scope) bill.scope = scope;
      if (data.has("note")) bill.note = (data.get("note") ?? "").replace(/^'(?=[=+\-@\t\r＝＋－＠])/,"");
      if (bill.kind === "management") {
        for (const field of managementKeys) {
          if (!data.has(field)) continue;
          const {label,unit} = managementFields[field];
          try { bill[field] = parseNumber(data.get(field) ?? "",unit,field==="sharedElectricity"); }
          catch (error) { errors.push(label+" · "+(error as Error).message); }
        }
      } else {
        try { if (data.has("gas")) bill.gas = parseNumber(data.get("gas") ?? "","원"); }
        catch (error) { errors.push("가스요금 · "+(error as Error).message); }
        if (data.has("start")) bill.start = data.get("start") || null;
        if (data.has("end")) bill.end = data.get("end") || null;
      }
      return {line,bill,errors:[...errors,...validateBill(bill,residence)],duplicate:old !== undefined};
    });
  });
}

export function exportBills(bills:Bill[]) {
  const fields = Object.keys(labels);
  return "\uFEFF"+Papa.unparse([Object.values(labels),...bills.map(bill=>fields.map(key=>{
    if (key === "kind") return kindNames[bill.kind];
    if (key === "scope") return scopeNames[bill.scope];
    if (key === "note") return /^[=+\-@\t\r＝＋－＠]/.test(bill.note) ? "'"+bill.note : bill.note;
    return bill[key as keyof typeof bill] ?? "";
  }))]);
}
