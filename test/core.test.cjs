const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core.cjs');
const {Store} = require('../src/store.cjs');
test('48 questions, stable unique IDs across 8 sections',()=>{
  assert.equal(core.questions.length,48);assert.equal(new Set(core.questions.map(q=>q.id)).size,48);assert.equal(core.categories.size,8);
});
test('draft answers are never sent until confirmed; excluded, skipped and revised answers revoke memories',()=>{
  const s=core.initialState(),c={messages:[]};
  core.saveAnswer(s,'daily.name',{text:'小椰',remember:true});
  assert(!JSON.stringify(core.payload(s,c,'你好').messages).includes('小椰'));
  core.confirmAnswers(s,['daily.name','daily.name']);assert.equal(s.memories.length,1);
  assert(JSON.stringify(core.payload(s,c,'你好').messages).includes('小椰'));
  core.saveAnswer(s,'daily.name',{text:'小椰',remember:false});assert.equal(s.memories.length,0);
  core.confirmAnswers(s,['daily.name']);assert.equal(s.memories.length,0);
  core.saveAnswer(s,'daily.name',{text:'椰子',remember:true,skipped:true});
  core.confirmAnswers(s,['daily.name']);assert.equal(s.memories.length,0);
  core.saveAnswer(s,'daily.name',{text:'椰子',remember:true});core.confirmAnswers(s,['daily.name']);
  core.saveAnswer(s,'daily.name',{text:'新的昵称',remember:true});assert.equal(s.memories.length,0);
});
test('candidate memories are sanitized, bounded, deduplicated, excluded from recall',()=>{
  const s=core.initialState();
  core.addCandidates(s,[{text:'用户喜欢椰子',category:'wrong'},{text:'用户喜欢椰子'},{text:7},{text:'超过3条'}],'conversation');
  assert.equal(s.memories.length,1);assert.equal(s.memories[0].category,'daily');assert.equal(core.retrieve(s,'椰子').length,0);
  assert(!JSON.stringify(core.payload(s,{messages:[]},'你好').messages).includes('用户喜欢椰子'));
});
test('memory persists across conversations, relevant memory outranks unrelated memories, bounded history',()=>{
  const s=core.initialState();
  for(let i=0;i<40;i++)s.memories.push({id:String(i),text:'其他偏好'+i,status:'confirmed',updatedAt:'2026-01-01',category:'daily'});
  s.memories.push({id:'family',text:'用户表示和姐姐关系亲近',status:'confirmed',updatedAt:'2026-01-01',category:'family'});
  const result=core.payload(s,{messages:Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'消息'+i}))},'姐姐最近很忙');
  assert.equal(result.memories[0].id,'family');assert.equal(result.memories.length,18);assert.equal(result.messages.length,26);
  assert(!result.messages.some(m=>m.content==='消息0'));
});
test('API endpoints protect credentials and require secure remote transport',()=>{
  assert.equal(core.validateEndpoint('https://example.com/v1/chat/completions'),'https://example.com/v1');
  assert.equal(core.validateEndpoint('http://127.0.0.1:1234/v1/'),'http://127.0.0.1:1234/v1');
  for(const endpoint of ['http://example.com/v1','file:///tmp/a','https://user:secret@example.com','https://example.com?key=secret','javascript:alert(1)','bad'])assert.throws(()=>core.validateEndpoint(endpoint));
});
test('local writes survive restart; valid backup recovers damaged state without overwriting evidence',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhiji-unit-'));
  try{
    const store=new Store(dir),s=store.load();s.answers.test={text:'first'};store.save(s);
    s.answers.test.text='second';store.save(s);
    assert.equal(new Store(dir).load().answers.test.text,'second');
    fs.writeFileSync(store.file,'{broken');
    const recovered=new Store(dir),result=recovered.load();assert.equal(result.answers.test.text,'first');assert(recovered.recovered);
    assert(fs.readdirSync(dir).some(f=>f.includes('damaged')));recovered.save(result);
    assert.equal(new Store(dir).load().answers.test.text,'first');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unrecoverable data is left untouched',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhiji-unit-'));
  try{const store=new Store(dir);fs.writeFileSync(store.file,'broken');assert.throws(()=>store.load());assert.equal(fs.readFileSync(store.file,'utf8'),'broken');}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing primary file recovers existing backup instead of starting empty',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhiji-unit-'));
  try{const store=new Store(dir),s=store.load();s.answers.test={text:'saved'};store.save(s);store.save(s);fs.unlinkSync(store.file);const next=new Store(dir);assert.equal(next.load().answers.test.text,'saved');assert(next.recovered);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('stored provider reasoning never enters subsequent chat prompts',()=>{
 const s=core.initialState();const c={messages:[{role:'assistant',content:'这是正式回复',reasoning:'仅供本机显示的思考文字'}]};
 const built=core.payload(s,c,'继续聊');assert(!JSON.stringify(built).includes('仅供本机显示的思考文字'));assert(JSON.stringify(built).includes('这是正式回复'));
});
