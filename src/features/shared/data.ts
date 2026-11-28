import {z} from "zod";
import {validDate} from "../utilities/model.ts";

export const entityId=z.uuid();
export const id=z.string().min(1).max(100);
export const text=z.string().max(1000);
export const name=z.string().trim().min(1).max(100);
export const date=z.string().refine(validDate);
export const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const won=z.number().int().min(0).max(999999999999);
export const list=z.array(name).max(100).refine(values=>new Set(values).size===values.length);
export const split=(value:string)=>[...new Set(value.split(/[,;]+/).map(item=>item.trim()).filter(Boolean))];
export const unique=<T>(rows:T[],key:(row:T)=>string)=>new Set(rows.map(key)).size===rows.length;
export const byDate=(a:{date:string;time?:string|null},b:{date:string;time?:string|null})=>(a.date+(a.time ?? "")).localeCompare(b.date+(b.time ?? ""));
export function frequency<T>(rows:T[],key:(row:T)=>string) {
  const values=new Map<string,number>();
  for (const row of rows) {
    const label=key(row);
    if (label) values.set(label,(values.get(label) ?? 0)+1);
  }
  return [...values].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"ko"));
}
