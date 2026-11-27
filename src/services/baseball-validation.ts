import {z} from "zod";
import {baseballLinks,booking,gameKey,localDateTime,results,types,validateGame,validateTicket,visits,type Baseball} from "../features/baseball/model.ts";
import {emptyData,type Documents,type Domain,type WorkspaceData} from "../features/workspace/data.ts";
import {validDate} from "../features/utilities/model.ts";

const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const name=z.string().trim().min(1).max(100);
const text=z.string().max(150);
const amount=z.number().int().min(0).max(999999999);
const score=z.number().int().min(0).max(999);
const date=z.string().refine(validDate);
const localTime=z.string().refine(localDateTime).nullable();

const game=z.strictObject({
  id,season:z.string().regex(/^\d{4}$/),date,time:z.string().max(5),away:name,home:name,location:text,ballpark:text,
  type:z.enum(Object.keys(types) as [keyof typeof types]),slot:z.number().int().min(0).max(2),planned:z.boolean(),
  visit:z.enum(Object.keys(visits) as [keyof typeof visits]),companions:text,note:z.string().max(2000),
  result:z.enum(Object.keys(results) as [keyof typeof results]),awayScore:score.nullable(),homeScore:score.nullable(),cost:amount.nullable(),seat:text,
});
const ticket=z.strictObject({
  id,gameId:id,status:z.enum(Object.keys(booking) as [keyof typeof booking]),general:localTime,early:localTime,bookedAt:localTime,
  vendor:text,url:z.string().max(1000),count:z.number().int().min(1).max(999).nullable(),section:text,row:text,seat:text,
  price:amount.nullable(),fee:amount,discount:amount,refund:amount,own:amount.nullable(),account:text,entryId:id.nullable(),caseId:id.nullable(),
  reminders:z.array(z.number().int().min(0).max(10080)).max(12).refine(rows=>rows.length===new Set(rows).size),
});
export const baseballSchema = z.strictObject({team:name,games:z.array(game).max(5000),tickets:z.array(ticket).max(10000)})
  .refine(({games,tickets})=>{
    const gamesById=new Set(games.map(row=>row.id));
    return gamesById.size===games.length && new Set(games.map(gameKey)).size===games.length && games.every(row=>!validateGame(row)) &&
      new Set(tickets.map(row=>row.id)).size===tickets.length && tickets.every(row=>gamesById.has(row.gameId) && !validateTicket(row));
  }) satisfies z.ZodType<Baseball>;

export function baseballGuard(current:Documents,changes:[Domain,unknown][]) {
  if (!changes.some(([domain])=>domain==="records" || domain==="settlements" || domain==="baseball")) return "";
  const changed=new Map(changes);
  const resolve=<K extends Domain>(domain:K)=>(changed.get(domain) ?? current[domain]?.value ?? emptyData[domain]) as WorkspaceData[K];
  return baseballLinks(resolve("baseball"),resolve("records").finance,resolve("settlements"));
}
