"use client";

import { useState } from "react";
import { YearComparisonChart } from "./charts";
import {
  change, comparisonFields, metrics, monthlyBills, scopeNames, selectBills, shiftMonth, sumMoney, yearComparison,
  type Bill, type ComparisonKey, type Scope,
} from "./model";

const format = new Intl.NumberFormat("ko-KR",{maximumFractionDigits:3});
const display = (value:number|null,unit:string)=>value===null ? "—" : format.format(value)+unit;
const signed = (value:number|null,unit:string)=>value!==null && value>0 ? "+"+display(value,unit) : display(value,unit);

export function UtilityComparison({bills,month,scope}:{bills:Bill[];month:string;scope:"all"|Scope}) {
  const [basis,setBasis] = useState<"withoutParking"|"total">("withoutParking");
  const [chartMetric,setChartMetric] = useState<ComparisonKey|"basis">("basis");
  const index = monthlyBills(bills);
  const year = month.slice(0,4);
  const priorMonth = shiftMonth(month,-12);
  const current = selectBills(index.get(month) ?? [],scope);
  const prior = selectBills(index.get(priorMonth) ?? [],"all");
  const previous = selectBills(index.get(shiftMonth(month,-1)) ?? [],scope);
  const currentValues = metrics(current);
  const lastYear = metrics(prior);
  const rows = yearComparison(index,year,scope,basis);
  const paired = rows.filter(row=>row.current!==null && row.previous!==null);
  const pairedCurrent = sumMoney(paired.map(row=>row.current));
  const pairedPrevious = sumMoney(paired.map(row=>row.previous));
  const aggregate = change(pairedCurrent,pairedPrevious);
  const trend = new Map<string,Record<Scope,(number|null)[]>>();
  for (const [key,monthly] of index) {
    const period = key.slice(0,4);
    const totals = trend.get(period) ?? {personal:[],reference:[]};
    for (const kind of ["personal","reference"] as const) {
      const value = metrics(selectBills(monthly,kind))[basis];
      if (value!==null) totals[kind].push(value);
    }
    trend.set(period,totals);
  }
  const trendScopes = scope==="all" ? (["personal","reference"] as const) : [scope];
  const metric = chartMetric==="basis" ? basis : chartMetric;
  const field = comparisonFields[basis];
  const keys = [basis,...(Object.keys(comparisonFields) as ComparisonKey[]).filter(key=>key!==basis)];
  const unknownParking = [current,prior].some(group=>group.some(bill=>bill.kind==="management" && bill.parking==null));

  return <>
    <section className="panel utility-year" aria-label="전년 동월 비교">
      <h2>{month} 전년 동월 비교</h2>
      <label>관리비 합계 비교 기준<select value={basis} onChange={event=>setBasis(event.target.value as typeof basis)}>
        <option value="withoutParking">주차비 제외 관리비</option><option value="total">관리비 고지서 합계</option>
      </select></label>
      <div className="utility-comparison">
        {([[month,current],["전월",previous],[priorMonth+" 전년 동월",prior]] as const).map(([label,group])=>{
          const value = metrics(group)[basis];
          return <div key={label}><span>{label} · {field.label}</span>
            <strong>{group.length ? display(value,"원") : "비교 데이터 없음"}</strong>
            {!!group.length && <small>{scopeNames[group[0].scope]}</small>}
          </div>;
        })}
      </div>
      {unknownParking && <p className="muted">주차비 미입력 월은 주차비 제외 금액을 정확히 계산할 수 없습니다. 주차비가 없다고 확인한 경우 0원을 입력하세요.</p>}
      <table className="utility-metric-table" aria-label="항목별 전년 동월 증감">
        <thead><tr><th scope="col">항목</th><th scope="col">{priorMonth}</th><th scope="col">{month}</th><th scope="col">증감</th><th scope="col">증감률</th></tr></thead>
        <tbody>{keys.map(key=>{
          const {difference,rate} = change(currentValues[key],lastYear[key]);
          const {label,unit} = comparisonFields[key];
          return <tr key={key}><th scope="row">{label}<small> ({unit})</small></th>
            <td>{display(lastYear[key],"")}</td><td>{display(currentValues[key],"")}</td>
            <td>{signed(difference,"")}</td><td>{signed(rate,"%")}</td>
          </tr>;
        })}</tbody>
      </table>
      <p className="muted">—는 비교할 값이 없거나 전년도 값이 0이어서 증감률을 계산할 수 없는 경우입니다.</p>
    </section>
    <section className="panel utility-year" aria-label="연간 관리비 비교">
      <h2>{year}년과 {Number(year)-1}년 비교</h2>
      <p>{field.label} · 같은 {paired.length}개월 기준</p>
      {paired.length ? <p>{display(pairedPrevious,"원")} → {display(pairedCurrent,"원")} · {signed(aggregate.difference,"원")} ({signed(aggregate.rate,"%")})</p>
        : <p className="muted">비교 데이터 없음</p>}
      <label>월별 그래프 항목<select value={chartMetric} onChange={event=>setChartMetric(event.target.value as typeof chartMetric)}>
        <option value="basis">관리비 합계 비교 기준 사용</option>
        {(Object.keys(comparisonFields) as ComparisonKey[]).map(key=><option key={key} value={key}>{comparisonFields[key].label}</option>)}
      </select></label>
      <YearComparisonChart rows={metric===basis ? rows : yearComparison(index,year,scope,metric)} year={year} metric={metric}/>
      <h3>연도별 관리비 추이 · {field.label}</h3>
      <table className="utility-metric-table" aria-label="연도별 관리비 추이">
        <thead><tr><th scope="col">연도</th>{trendScopes.map(kind=><th key={kind} scope="col">{scopeNames[kind]}</th>)}</tr></thead>
        <tbody>{[...trend].sort(([a],[b])=>b.localeCompare(a)).map(([period,totals])=><tr key={period}>
          <th scope="row">{period}년</th>
          {trendScopes.map(kind=><td key={kind}>{display(sumMoney(totals[kind]),"원")}{totals[kind].length>0 && <small> · {totals[kind].length}개월</small>}</td>)}
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}
