import assert from "node:assert/strict";
import test from "node:test";
import { sampleRecords } from "../src/features/modules.ts";
import { initialFinance, createMonth } from "../src/features/finance/model.ts";
import { sampleUtilities } from "../src/features/utilities/model.ts";
import { parseDocument, importRequest, writeRequest } from "../src/services/workspace-validation.ts";
import { isSameOrigin } from "../src/services/workspace-access.ts";

const today = "2026-11-27";

test("accepts browser datasets and rejects duplicate or invalid expenses and bills",()=>{
  const records = sampleRecords(today);
  assert.ok(parseDocument("records",records).success);
  assert.equal(parseDocument("records",{...records,finance:[...records.finance,records.finance[0]]}).success,false);
  assert.equal(parseDocument("records",{...records,inventory:[{...records.inventory[0],amount:-1}]}).success,false);
  const finance = initialFinance(today);
  const monthly = createMonth(finance.rules,[],"2026-11");
  assert.ok(parseDocument("finance",{...finance,monthly}).success);
  assert.equal(parseDocument("finance",{...finance,monthly:[...monthly,monthly[0]]}).success,false);
  assert.equal(parseDocument("finance",{...finance,monthly:[{...monthly[0],paidAmount:100}]}).success,false);
  const utility = sampleUtilities(today);
  assert.ok(parseDocument("utilities",utility).success);
  assert.equal(parseDocument("utilities",{...utility,bills:[...utility.bills,utility.bills[0]]}).success,false);
  const bills = [
    {...utility.bills[0],scope:"reference",parking:0},
    {...utility.bills[0],scope:"personal",parking:null},
  ];
  assert.ok(parseDocument("utilities",{...utility,bills}).success);
  assert.equal(parseDocument("utilities",{...utility,bills:[{...bills[0],parking:-1}]}).success,false);
  const legacy = Object.fromEntries(Object.entries(bills[0]).filter(([key])=>key!=="parking" && key!=="parkingInBase"));
  assert.ok(parseDocument("utilities",{...utility,bills:[legacy]}).success);
  const oldPayload = {...utility,bills:[{...legacy,parkingInBase:true,parking:6000}]};
  const read = parseDocument("utilities",oldPayload);
  assert.ok(read.success);
  assert.deepEqual(read.data,oldPayload);
  assert.ok(writeRequest.safeParse({domain:"utilities",revision:0,value:utility,confirmedOutsideResidence:true}).success);
});

test("requires explicit import confirmation and rejects a client-supplied owner",()=>{
  assert.ok(importRequest.safeParse({kind:"import",confirmed:true,data:{memories:["가상 예시"]}}).success);
  assert.equal(importRequest.safeParse({kind:"import",confirmed:false,data:{memories:[]}}).success,false);
  assert.equal(writeRequest.safeParse({domain:"memories",revision:0,value:[],userId:"another"}).success,false);
  assert.equal(parseDocument("chat",[{id:"demo",title:"가상 예시",messages:[{role:"system",content:"invalid"}]}]).success,false);
});

test("checks write origin against the configured canonical URL",()=>{
  assert.ok(isSameOrigin("https://onharu.example.invalid","https://onharu.example.invalid"));
  assert.equal(isSameOrigin("https://onharu.example.invalid.attacker.invalid","https://onharu.example.invalid"),false);
  assert.equal(isSameOrigin(null,"https://onharu.example.invalid"),false);
  assert.equal(isSameOrigin("http://localhost:3000","http://localhost:3001"),false);
});
