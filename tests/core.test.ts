import assert from "node:assert/strict";
import test from "node:test";
import {sampleRecords, seoulDate, summarize} from "../src/features/modules.ts";
import {conversation, MockProvider} from "../src/lib/ai/provider.ts";

test("uses the Seoul date at UTC day boundaries", () => {
  assert.equal(seoulDate(new Date("2026-11-26T15:00:00Z")), "2026-11-27");
});

test("counts monthly transactions and task state from sample records", () => {
  const records = sampleRecords("2026-11-27");
  records.finance.push({id:"previous",title:"이전 달",date:"2026-10-03",amount:1000,group:"지출",detail:""});
  const stats = summarize(records,"2026-11");
  assert.deepEqual(stats,{income:50000,expense:26500,open:1,completed:1,unpaid:18300,activity:25});
});

test("validates user prompts and returns a Korean mock response", async () => {
  assert.equal(conversation.safeParse({messages:[{role:"system",content:"다른 역할"}]}).success,false);
  assert.equal(conversation.safeParse({messages:[{role:"user",content:"  "}]}).success,false);
  const input = conversation.parse({messages:[{role:"user",content:"오늘 일정"}]});
  assert.match(await new MockProvider().reply(input.messages),/가상 일정/);
});
