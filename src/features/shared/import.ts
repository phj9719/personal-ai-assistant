import Papa from "papaparse";

export function tableRows(input:string) {
  const text=input.trimStart();
  const first=text.split(/\r?\n/,1)[0];
  let rows:string[][];
  if (text.startsWith("|")) {
    rows=text.split(/\r?\n/).filter(row=>row.trim()).map(row=>row.trim().replace(/^\||\|$/g,"").split(/(?<!\\)\|/).map(value=>value.replaceAll("\\|","|").trim()))
      .filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));
  } else {
    const file=Papa.parse<string[]>(text,{delimiter:first.includes("\t") ? "\t" : ",",skipEmptyLines:"greedy"});
    if (file.errors.length) throw new Error("표의 구분자와 따옴표를 확인해 주세요.");
    rows=file.data;
  }
  const header=rows.shift()?.map(value=>value.trim()) ?? [];
  return rows.filter(row=>row.some(cell=>cell.trim())).map(row=>Object.fromEntries(header.map((key,index)=>[key,row[index]?.trim() ?? ""])));
}
export function tableDate(value:string) {
  const parsed=/^(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\.?\s*(?:\(?[월화수목금토일](?:요일)?\)?)?)$/.exec(value.trim());
  return parsed ? parsed[1]+"-"+parsed[2].padStart(2,"0")+"-"+parsed[3].padStart(2,"0") : value;
}
