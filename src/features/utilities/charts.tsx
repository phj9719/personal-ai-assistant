"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { effectiveScope, housing, scopeNames, type Bill, type Residence, type Scope } from "./model";

const series = {
  electricityUsage:"전기 사용량 (kWh)", electricity:"전기요금 (원)", waterUsage:"수도 사용량 (㎥)", water:"수도요금 (원)",
  gas:"가스요금 (원)", management:"관리비 합계 (원)", housing:"총 주거비 (원)",
};
type Metric = keyof typeof series;
const charts: {title:string; metrics:Metric[]; usage?:Metric}[] = [
  {title:"전기 사용량과 요금",metrics:["electricityUsage","electricity"],usage:"electricityUsage"},
  {title:"수도 사용량과 요금",metrics:["waterUsage","water"],usage:"waterUsage"},
  {title:"가스비",metrics:["gas"]},
  {title:"관리비와 총 주거비",metrics:["management","housing"]},
];

export function UtilityCharts({bills,residence}:{bills:Bill[];residence:Residence}) {
  const scopes = (["personal","reference"] as const).filter(scope=>bills.some(bill=>effectiveScope(bill,residence)===scope));
  const rows = [...new Set(bills.map(bill=>bill.month))].sort().map(month=>{
    const data:Record<string,string|number|null> = {month};
    for (const scope of scopes) {
      const group = bills.filter(bill=>bill.month===month && effectiveScope(bill,residence)===scope);
      const management = group.find(bill=>bill.kind === "management");
      const gas = group.find(bill=>bill.kind === "gas");
      const total = housing(group);
      const values:Record<Metric,number|null> = {
        electricityUsage:management?.electricityUsage ?? null,electricity:management?.electricity ?? null,
        waterUsage:management?.waterUsage ?? null,water:management?.water ?? null,
        gas:gas?.gas ?? null,management:management?.total ?? null,housing:total.complete ? total.total : null,
      };
      for (const metric of Object.keys(series) as Metric[]) data[scope+":"+metric] = values[metric];
    }
    return data;
  });
  return <div className="utility-charts">{charts.map(({title,metrics,usage})=>{
    const visible = scopes.flatMap(scope=>metrics.map((metric,index)=>({scope,metric,index})))
      .filter(({scope,metric})=>rows.some(row=>row[scope+":"+metric]!=null));
    return <section key={title} className="panel chart">
      <h2>{title}</h2>
      {visible.length ? <ResponsiveContainer width="100%" height={230} minWidth={0}>
        <LineChart data={rows} margin={{left:0,right:12,top:8,bottom:0}}>
          <CartesianGrid vertical={false} stroke="var(--line)"/>
          <XAxis dataKey="month" tick={{fill:"var(--muted)",fontSize:11}} minTickGap={18}/>
          <YAxis yAxisId="money" width={57} tick={{fill:"var(--muted)",fontSize:11}} tickFormatter={value=>Intl.NumberFormat("ko-KR",{notation:"compact"}).format(value)}/>
          {usage && <YAxis yAxisId="usage" orientation="right" width={36} tick={{fill:"var(--muted)",fontSize:11}}/>}
          <Tooltip contentStyle={{background:"var(--surface)",color:"var(--ink)",borderColor:"var(--line)"}}/>
          <Legend/>
          {visible.map(({scope,metric,index})=><Line key={scope+metric} yAxisId={metric===usage ? "usage" : "money"} dataKey={scope+":"+metric}
            name={series[metric]+" · "+shortScope(scope)} stroke={index ? "var(--utility-secondary)" : "var(--accent)"}
            strokeDasharray={scope==="reference" ? "5 4" : undefined} dot={{r:scope==="reference" ? 4 : 3,fill:scope==="reference" ? "var(--surface)" : undefined}}
            strokeWidth={2} isAnimationActive={false}/>)}
        </LineChart>
      </ResponsiveContainer> : <p className="muted">조회 기간에 표시할 데이터가 없습니다.</p>}
    </section>;
  })}</div>;
}

function shortScope(scope:Scope) {
  return scope === "personal" ? "본인" : scopeNames.reference;
}
