import {initialBaseball,type Baseball} from "../baseball/model.ts";
import type { Records } from "../modules";
import type { FinanceState } from "../finance/model";
import type { Settlements } from "../settlements/model";
import type { UtilityState } from "../utilities/model";

export type Message = {id?:string;role:"user"|"assistant";content:string};
export type ChatSession = {id:string;title:string;messages:Message[]};
export type WorkspaceData = {
  records:Records; utilities:UtilityState; finance:FinanceState; settlements:Settlements; baseball:Baseball;
  chat:ChatSession[]; memories:string[]; theme:"light"|"dark";
};
export type Domain = keyof WorkspaceData;
export type Revisioned = { revision:number; value:unknown };
export type Documents = Partial<Record<Domain,Revisioned>>;
export const browserKeys = {
  records:"onharu-records-v1",utilities:"onharu-utilities-v1",finance:"onharu-fixed-finance-v1",
  baseball:"onharu-baseball-v1",settlements:"onharu-settlements-v1",chat:"onharu-chat-v1",memories:"onharu-memories-v1",theme:"onharu-theme-v1",
} as const;
export const domains = Object.keys(browserKeys) as Domain[];

export const emptyData:WorkspaceData = {
  records:{schedule:[],tasks:[],finance:[],inventory:[],utilities:[],knowledge:[],learning:[],analytics:[]},
  utilities:{residence:{start:null,end:null},bills:[]},
  finance:{accounts:[],rules:[],monthly:[],transfers:[]},
  baseball:initialBaseball,settlements:[],chat:[],memories:[],theme:"light",
};
