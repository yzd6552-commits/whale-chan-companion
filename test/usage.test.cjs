const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recordUsage,normalizeUsage,usageDay}=require('../src/usage.cjs');
test('usage numbers come from provider, never from character estimates',()=>{
 assert.deepEqual(normalizeUsage({prompt_tokens:10,completion_tokens:4,total_tokens:14,completion_tokens_details:{reasoning_tokens:2}}),{input:10,output:4,total:14,reasoning:2});
 for(const raw of [null,{}, {prompt_tokens:-1,completion_tokens:4},{prompt_tokens:'10',completion_tokens:4},{prompt_tokens:NaN,completion_tokens:4}])assert.equal(normalizeUsage(raw),null);
 assert.equal(normalizeUsage({prompt_tokens:10,completion_tokens:4}).total,14);
});
test('today switches at Beijing midnight; cumulative usage survives daily rollover',()=>{
 const s={},before=new Date('2026-10-14T15:59:59Z'),after=new Date('2026-10-14T16:00:00Z');
 assert.equal(usageDay(before),'2026-10-14');assert.equal(usageDay(after),'2026-10-15');
 recordUsage(s,{prompt_tokens:10,completion_tokens:4},'chat',before);
 recordUsage(s,{prompt_tokens:20,completion_tokens:5},'chat',after);
 recordUsage(s,{prompt_tokens:30,completion_tokens:6},'memory',after);
 recordUsage(s,undefined,'connection',after);
 assert.equal(s.usage.byKind.chat.total,39);assert.equal(s.usage.days['2026-10-14'].chat.total,14);assert.equal(s.usage.days['2026-10-15'].chat.total,25);assert.equal(s.usage.days['2026-10-15'].memory.total,36);assert.equal(s.usage.byKind.connection.unreported,1);
 const reloaded=JSON.parse(JSON.stringify(s));assert.equal(reloaded.usage.days['2026-10-15'].chat.total,25);
});
