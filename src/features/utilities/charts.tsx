"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { comparisonFields, metrics as billMetrics, monthlyBills, scopeNames, type Bill, type ComparisonKey, type Scope } from "./model";

const series = {
  electricityUsage:"전기 사용량 (kWh)", electricity:"전기요금 (원)", waterUsage:"수도 사용량 (㎥)", water:"수도요금 (원)",
  gas:"가스요금 (원)", total:"관리비 고지서 합계 (원)", housing:"총 주거비 (원)",
};
type Metric = keyof typeof series;
const charts: {title:string; metrics:Metric[]; usage?:Metric}[] = [
  {title:"전기 사용량과 요금",metrics:["electricityUsage","electricity"],usage:"electricityUsage"},
  {title:"수도 사용량과 요금",metrics:["waterUsage","water"],usage:"waterUsage"},
  {title:"가스비",metrics:["gas"]},
  {title:"관리비와 총 주거비",metrics:["total","housing"]},
];

export function YearComparisonChart({rows,year,metric}:{rows:{month:string;current:number|null;previous:number|null}[];year:string;metric:ComparisonKey}) {
  const label = comparisonFields[metric];
  return <div className="utility-year-chart">
    <h3>{label.label} 월별 비교 ({label.unit})</h3>
    {rows.some(row=>row.current!==null || row.previous!==null) ? <ResponsiveContainer width="100%" height={235} minWidth={0}>
      <LineChart data={rows} margin={{left:4,right:12,top:8,bottom:0}}>
        <CartesianGrid vertical={false} stroke="var(--line)"/>
        <XAxis dataKey="month" tick={{fill:"var(--muted)",fontSize:11}} minTickGap={12}/>
        <YAxis width={51} tick={{fill:"var(--muted)",fontSize:11}} tickFormatter={value=>Intl.NumberFormat("ko-KR",{notation:"compact"}).format(value)}/>
        <Tooltip contentStyle={{background:"var(--surface)",color:"var(--ink)",borderColor:"var(--line)"}}/>
        <Legend/>
        <Line name={year+"년"} dataKey="current" stroke="var(--accent)" isAnimationActive={false}/>
        <Line name={String(Number(year)-1)+"년"} dataKey="previous" stroke="var(--utility-secondary)" strokeDasharray="5 4" isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer> : <p className="muted">비교 데이터 없음</p>}
  </div>;
}

export function UtilityCharts({bills}:{bills:Bill[]}) {
  const scopes = (["personal","reference"] as const).filter(scope=>bills.some(bill=>bill.scope===scope));
  const rows = [...monthlyBills(bills)].sort(([a],[b])=>a.localeCompare(b)).map(([month,group])=>{
    const data:Record<string,string|number|null> = {month};
    for (const scope of scopes) {
      const values = billMetrics(group.filter(bill=>bill.scope===scope));
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
