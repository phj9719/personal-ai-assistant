import assert from "node:assert/strict";
import test from "node:test";
import {balance,caseError,caseStatus,equalShares,installmentPlan,linkedError,openPlans,paymentState,peopleOf,personBalance,
  receivableStats,shareText,type Advance,type Receipt,type Split} from "../src/features/settlements/model.ts";
import {financeStatistics} from "../src/features/finance/model.ts";
import {emptyData} from "../src/features/workspace/data.ts";
import type {Entry} from "../src/features/modules.ts";
import {settlementGuard,settlementsSchema} from "../src/services/settlement-validation.ts";

const date = "2024-01-25";
const payment = {id:"pay1",title:"가상 결제",date,amount:10001,method:"transfer" as const,account:"",entryId:null};
const split:Split = {
  id:"split",kind:"split",title:"가상 식사",date,note:"",own:1001,due:"2024-02-01",
  payments:[payment],debits:[],receipts:[],people:[{id:"guest-a",name:"예시 A",share:9000},{id:"guest-b",name:"예시 B",share:0}],
};
const advance:Advance = {
  id:"advance",kind:"advance",title:"가상 대납",name:"가상 상환자",date,note:"",own:1000,target:9000,
  payments:[{...payment,id:"pay2",amount:10000,method:"card"}],debits:[],receipts:[],adjustments:[],
  cardInstallments:6,repayment:"regular",start:"2024-01-31",end:"2024-04-30",planAmount:3000,plans:[],
};
const receipt = (id:string,personId:string,amount:number,paidOn="2024-02-02"):Receipt=>
  ({id,personId,amount,date:paidOn,note:"",account:"가상 계좌",entryId:null});
const ledgerRow = (id:string,amount:number,group="지출",recorded=date):Entry=>({id,amount,date:recorded,group,title:"가상 원본 거래",detail:""});

test("validates unequal and zero shares, and assigns truncated remainder to the owner",()=>{
  assert.equal(caseError(split),"");
  assert.equal(caseError({...split,own:1000}).length>0,true);
  assert.deepEqual(equalShares(10001,2,500),{share:3000,own:4001});
  assert.deepEqual(equalShares(10001,2,5000),{share:0,own:10001});
  assert.match(shareText(split),/예시 B 0원/);
});

test("tracks partial payments, completion, cancellation and duplicated receipt IDs",()=>{
  const one=receipt("a","guest-a",3000);
  const two=receipt("b","guest-a",6000);
  const partial={...split,receipts:[one]};
  assert.equal(balance(partial),6000);
  assert.equal(paymentState(3000,personBalance(partial,split.people[0])),"부분 입금");
  const done={...split,receipts:[one,two]};
  assert.equal(caseStatus(done,"2024-02-03"),"정산 완료");
  assert.equal(balance({...done,receipts:[two]}),3000);
  assert.equal(settlementsSchema.safeParse([{...split,receipts:[one,one]}]).success,false);
  assert.equal(settlementsSchema.safeParse([{...split,receipts:[receipt("x","guest-b",1)]}]).success,false);
});

test("generates monthly installments independently of card term and calculates arrears FIFO",()=>{
  let n=0;
  const plans=installmentPlan("2024-01-31","2024-04-30",3000,9000,()=>String(++n));
  assert.deepEqual(plans.map(row=>[row.date,row.amount]),[["2024-01-31",3000],["2024-02-29",3000],["2024-03-31",3000]]);
  const partial={...advance,plans,receipts:[receipt("x","advance",3500)],adjustments:[{id:"reduction",date:"2024-02-06",kind:"waive" as const,amount:500,note:""}]};
  assert.equal(caseError(partial),"");
  assert.deepEqual(openPlans(partial).map(row=>row.amount),[0,2000,3000]);
  assert.equal(caseStatus(partial,"2024-03-01"),"연체");
  const stats=receivableStats([partial],"2024-03","2024-03-01");
  assert.deepEqual([stats.received,stats.balance,stats.overdue,stats.scheduled,stats.people[0][1]],[3500,5000,2000,3000,5000]);
  const undated={...advance,target:null,start:null,end:null,plans:[]};
  assert.equal(caseStatus(undated,"2024-03-01"),"예정일 미지정");
  assert.equal(peopleOf(undated)[0].share,9000);
});

test("links source records once, protects edits and separates card approval, cash and recovery",()=>{
  const cash=ledgerRow("cash",10001);
  const approval=ledgerRow("approval",10000);
  const debit=ledgerRow("debit",2000,"지출","2024-02-05");
  const reimbursement=ledgerRow("refund",3000,"수입","2024-02-02");
  const ordinaryIncome=ledgerRow("salary",100000,"수입","2024-02-06");
  const splitWithLink={...split,payments:[{...payment,entryId:cash.id}],receipts:[{...receipt("linked-receipt","guest-a",3000),entryId:reimbursement.id}]};
  const withCard={...advance,payments:[{...advance.payments[0],entryId:approval.id}],
    debits:[{id:"card-debit",title:"가상 카드 출금",date:debit.date,amount:debit.amount,account:"",entryId:debit.id}]};
  const ledger=[cash,approval,debit,reimbursement,ordinaryIncome];
  const cases=[splitWithLink,withCard];
  assert.equal(linkedError(cases,ledger),"");
  assert.ok(linkedError([...cases,splitWithLink],ledger));
  const documents={settlements:{revision:1,value:cases}};
  assert.ok(settlementGuard(documents,[["records",{...emptyData.records,finance:ledger.slice(1)}]]));
  const january=financeStatistics("2024-01",[],[],ledger,emptyData.utilities,cases);
  assert.deepEqual([january.consumption,january.outflow,january.refunds],[2001,10001,0]);
  const february=financeStatistics("2024-02",[],[],ledger,emptyData.utilities,cases);
  assert.deepEqual([february.income,february.outflow,february.refunds,february.balance],[100000,2000,3000,101000]);
  assert.ok(caseError({...withCard,debits:[{...withCard.debits[0],amount:10001}]}));
});
