const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core.cjs'),p=require('../src/profile.cjs');
function fixture(){const state=core.initialState();state.memories=[{id:'a',text:'用户希望先倾听再建议。',category:'support',status:'confirmed',source:'问卷 · 本人确认',updatedAt:'2026-10-15T00:00:00Z'},{id:'draft',text:'不应发送的草稿',status:'pending',category:'personality'}];return state;}
function generate(s,text='用户在倾诉时更希望先被倾听。'){return p.propose(s,{entries:[{text,kind:'inference',category:'support',sourceIds:['a']}],questions:['最近你希望我怎么陪你？']},p.input(s));}
function accept(s,d){p.approve(s,d.id,d.entries.map(e=>({id:e.id,text:e.text,kind:e.kind})),d.questions.map(q=>q.id));}
test('profile uses confirmed memories only; pending profile cannot enter chat',()=>{
 const s=fixture();assert(!JSON.stringify(p.input(s)).includes('不应发送的草稿'));const d=generate(s,'候选推测独有标记');assert(!JSON.stringify(core.payload(s,{messages:[]},'你好')).includes('候选推测独有标记'));
 accept(s,d);const built=core.payload(s,{messages:[]},'你好');assert(JSON.stringify(built).includes('候选推测独有标记'));assert(built.messages[0].content.includes('暂时推测'));
});
test('grounding rejects invented or absent evidence and sanitizes categories',()=>{
 const s=fixture();assert.throws(()=>p.propose(s,{entries:[{text:'不存在的依据',category:'support',sourceIds:['missing']},{text:'部分假依据',category:'support',sourceIds:['a','missing']},{text:'无依据',category:'support',sourceIds:[]},{text:'未知分类',category:'diagnosis',sourceIds:['a']}],questions:[]},p.input(s)),/有效依据/);
});
test('source edits and revocations remove derived current, draft and historical understanding',()=>{
 const s=fixture();accept(s,generate(s));accept(s,generate(s,'第二版理解'));generate(s,'第三版候选');assert.equal(p.ensure(s).history.length,1);
 s.memories[0].text='用户已经改变偏好';p.sync(s);assert.equal(s.profile.current.length,0);assert.equal(s.profile.draft,null);assert.equal(s.profile.history[0].entries.length,0);assert.equal(s.profile.questions.length,0);
});
test('approval detects stale drafts; rejection and deletion do not silently apply',()=>{
 const s=fixture();const d=generate(s);s.memories[0].status='pending';assert.throws(()=>accept(s,d),/已更新/);
 s.memories[0].status='confirmed';const d2=generate(s);p.reject(s);assert.equal(s.profile.current.length,0);assert.equal(generate(s).entries.length,0);assert.equal(generate(s,'同一依据上的另一种措辞').entries.length,0);
 s.profile.suppressed=[];accept(s,generate(s));const id=s.profile.current[0].id;p.remove(s,id);assert.equal(s.profile.current.length,0);assert.equal(generate(s).entries.length,0);
});
test('auto profile is initial then after five additions, never while a draft waits',()=>{
 const s=fixture();assert(p.due(s));accept(s,generate(s));assert(!p.due(s));
 for(let i=0;i<4;i++)s.memories.push({id:'new'+i,text:'新记忆'+i,category:'daily',status:'confirmed'});assert(!p.due(s));s.memories.push({id:'fifth',text:'第五条',category:'daily',status:'confirmed'});assert(p.due(s));generate(s);assert(!p.due(s));
 s.settings.autoProfile=false;s.profile.draft=null;assert(!p.due(s));
});
test('optional followups have turn and time cooldown, and question drafts never leak',()=>{
 const s=fixture();generate(s);s.conversations=[{messages:Array.from({length:10},()=>({role:'user',content:'聊天'}))}];assert.equal(p.context(s,'聊聊').question,null);accept(s,s.profile.draft);const q=p.context(s,'聊聊').question;assert(q);p.offered(s,q.id);assert.equal(p.context(s,'聊聊').question,null);
 s.conversations[0].messages.push(...Array.from({length:20},()=>({role:'user',content:'继续'})));assert.equal(p.context(s,'聊聊').question,null);s.profile.lastQuestionAt='2026-01-01T00:00:00Z';assert(p.context(s,'聊聊').question);
});
test('source selection, prompt profile and history are bounded and survive disk serialization',()=>{
 const s=fixture();accept(s,generate(s));for(let i=0;i<80;i++)s.memories.push({id:'m'+i,text:'确认记忆'+i,status:'confirmed',category:'daily'});assert.equal(p.input(s).memories.length,60);
 assert(p.input(s).memories.some(m=>m.id==='a'));const reloaded=JSON.parse(JSON.stringify(s));assert.equal(p.context(reloaded,'聊天').entries.length,1);assert.equal(p.ensure(reloaded).current[0].kind,'inference');
});
