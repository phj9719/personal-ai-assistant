import assert from "node:assert/strict";
import test from "node:test";
import {createMonth, expected, financeStatistics, initialFinance, invoice, outstanding, readPeriod, validateRule, type Rule, type Transfer} from "../src/features/finance/model.ts";
import {blankBill, type UtilityState} from "../src/features/utilities/model.ts";

const today = "2024-02-16";
const example = initialFinance(today);
const housing:UtilityState = {residence:{start:"2024-01-01",end:null},bills:[]};
const rule = (fields:Partial<Rule> = {}):Rule => ({...example.rules[0],start:"2024-01-01",...fields});

test("generates one snapshot per rule and month, including leap-month due dates",()=>{
  const fixed = rule({timing:"exact",day:31});
  const rows = createMonth([fixed],[],"2024-02");
  assert.equal(rows.length,1);
  assert.equal(rows[0].due,"2024-02-29");
  assert.equal(expected(rows[0]).amount,29000);
  const original = {...rows[0],paidOn:"2024-03-02",paidAmount:30000};
  const changed = {...fixed,title:"변경된 예시",quote:{...fixed.quote,amount:31000}};
  assert.deepEqual(createMonth([changed],[original],"2024-02"),[original]);
  assert.equal(createMonth([changed],[original],"2024-03")[1].quote.amount,31000);
  assert.equal(createMonth([{...fixed,archived:true}],[original],"2024-03").length,1);
  assert.equal(createMonth([{...fixed,active:false}],[],"2024-02").length,0);
  assert.equal(createMonth([{...fixed,end:"2024-01-31"}],[],"2024-02").length,0);
});

test("supports variable ranges, optional schedules and inclusive daily periods",()=>{
  const variable = rule({quote:{mode:"variable",amount:null,min:8000,max:12000},timing:"unspecified",day:null});
  const daily = rule({id:"daily",start:"2024-02-10",end:"2024-02-20",timing:"approximate",day:28,quote:{mode:"daily",amount:32.15,min:null,max:null}});
  const rows = createMonth([variable,daily],[],"2024-02");
  assert.equal(validateRule(variable,[]),"");
  assert.equal(rows[0].due,null);
  assert.deepEqual(expected(rows[0]),{amount:null,min:8000,max:12000});
  assert.equal(rows[1].due,"2024-02-20");
  assert.equal(expected(rows[1]).amount,353.65);
  assert.equal(expected({...rows[1],periodStart:"2024-02-27",periodEnd:"2024-03-01"}).amount,128.6);
  assert.equal(readPeriod("2024-02-30","2024-03-02"),false);
  assert.notEqual(validateRule({...variable,quote:{...variable.quote,amount:13000}},[]),"");
  assert.notEqual(validateRule({...variable,quote:{...variable.quote,max:null}},[]),"");
});

test("uses own utility invoices for outstanding estimates only and prevents duplicate linkage",()=>{
  const bill = blankBill("management","2024-02","personal");
  assert.equal(bill.kind,"management");
  const utility = {...housing,bills:[{...bill,total:43000}]};
  const linked = rule({utility:"management"});
  const duplicate = rule({id:"duplicate",utility:"management"});
  const rows = createMonth([linked,duplicate],[],"2024-02");
  assert.equal(rows.length,1);
  assert.notEqual(validateRule(duplicate,[linked]),"");
  assert.equal(invoice(rows[0],utility),43000);
  assert.equal(invoice(rows[0],{...housing,bills:[{...bill,total:43000,scope:"reference"}]}),null);
  assert.equal(outstanding(rows[0],utility).amount,43000);
  const planned = financeStatistics("2024-02",rows,[],[],utility);
  assert.equal(planned.planned.min,29000);
  assert.equal(planned.remaining.min,43000);
  assert.equal(planned.outflow,0);
  const paid = financeStatistics("2024-02",[{...rows[0],paidOn:"2024-02-18",paidAmount:42000}],[],[],utility);
  assert.equal(paid.outflow,42000);
  assert.equal(paid.remaining.min,0);
});

test("separates savings and investment from consumption and books actual payments in the paid month",()=>{
  const rows = createMonth([rule(),rule({id:"savings",purpose:"savings"})],[],"2024-02");
  const paid = [{...rows[0],paidOn:"2024-02-25",paidAmount:12500},{...rows[1],paidOn:"2024-03-01",paidAmount:15000}];
  const transfers:Transfer[] = [{id:"demo-investment",title:"예시",purpose:"investment",date:"2024-02-24",amount:10000,payment:{method:"transfer",accountId:null}}];
  const ledger = [{group:"수입",date:"2024-02-01",amount:100000},{group:"지출",date:"2024-02-12",amount:1500}];
  const stats = financeStatistics("2024-02",paid,transfers,ledger,housing);
  assert.deepEqual([stats.consumption,stats.savings,stats.investment,stats.outflow,stats.balance,stats.paid],[14000,0,10000,24000,76000,12500]);
  const next = financeStatistics("2024-03",paid,transfers,ledger,housing);
  assert.equal(next.savings,15000);
  assert.equal(next.consumption,0);
});
