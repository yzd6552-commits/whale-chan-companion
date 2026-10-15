const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core.cjs'),profile=require('../src/profile.cjs');const {ProfileWorker}=require('../src/profile-worker.cjs');
function fixture(extract,options={}){let state=core.initialState(),busy=false,saves=0;state.memories=[{id:'a',text:'明确自述',category:'daily',status:'confirmed'}];const worker=new ProfileWorker({getState:()=>state,ready:()=>true,busy:()=>busy,save:()=>saves++,extract,...options});return {worker,get state(){return state;},replace:()=>state=core.initialState(),busy:v=>busy=v,get saves(){return saves;}};}
const result={entries:[{category:'daily',text:'用户明确说过的事',kind:'fact',sourceIds:['a']}],questions:[]};
test('auto worker waits for idle and creates only a review draft',async()=>{const f=fixture(async()=>result,{idleDelay:5});try{f.worker.schedule();assert(!f.state.profile?.draft);await new Promise(r=>setTimeout(r,40));assert(f.state.profile.draft);assert.equal(f.state.profile.current.length,0);}finally{f.worker.close();}});
test('chat and memory extraction have priority over profile API calls',async()=>{let calls=0;const f=fixture(async()=>{calls++;return result;});try{f.busy(true);await f.worker.run();assert.equal(calls,0);f.busy(false);await f.worker.run();assert.equal(calls,1);}finally{f.worker.close();}});
test('pause, reset and source edits reject delayed results',async()=>{for(const change of [f=>f.worker.pause(),f=>f.replace(),f=>f.state.memories[0].text='changed',f=>profile.ensure(f.state).suppressed.push('user correction'),f=>f.state.settings.autoProfile=false]){let done;const f=fixture(()=>new Promise(r=>done=r));try{const running=f.worker.run();change(f);done(result);await running;assert(!f.state.profile?.draft);assert.equal(f.saves,0);}finally{f.worker.close();}}});
test('manual generation remains available when auto summaries are paused',async()=>{const f=fixture(async()=>result,{manualDelay:5});try{f.state.settings.autoProfile=false;f.worker.schedule(true);await new Promise(r=>setTimeout(r,40));assert(f.state.profile.draft);}finally{f.worker.close();}});
test('failed and timed-out jobs retain current profile and stop repeated API calls',async()=>{for(const extract of [async()=>{throw Error('network');},(_,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('abort'))))]){const f=fixture(extract,{requestTimeout:5});try{await f.worker.run();assert(f.state.profile.error);assert.equal(f.worker.timer,null);assert.equal(f.state.profile.current.length,0);}finally{f.worker.close();}}});
test('a valid slow summary can finish beyond the old ninety-second deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let done,signal;
 const f=fixture((_,s)=>{signal=s;return new Promise(r=>done=r);});
 try{const running=f.worker.run();t.mock.timers.tick(95000);assert(!signal.aborted);done({...result,companion:{adjustments:[],suggestions:[]}});await running;assert(f.state.profile.draft);}finally{f.worker.close();}
});
test('companion-only errors are visible and a successful manual retry clears the shared failure',async()=>{
 let fail=true,seen=[];const f=fixture(async(_,signal,progress)=>{progress('thinking');seen.push(f.worker.active.phase);if(fail)throw new TypeError('secret-key raw network details');return {companion:{adjustments:[],suggestions:[]}};});
 try{f.worker.manual=true;f.worker.scope='persona';await f.worker.run();assert.equal(f.state.profile.errorKind,'network');assert.equal(f.state.persona.error,f.state.profile.error);assert(!f.state.persona.error.includes('secret-key'));assert.equal(f.worker.timer,null);
 fail=false;f.worker.manual=true;f.worker.scope='persona';await f.worker.run();assert.equal(f.state.profile.error,undefined);assert.equal(f.state.profile.errorSignature,undefined);assert.equal(f.state.persona.error,undefined);assert.deepEqual(seen,['thinking','thinking']);assert(f.state.persona.lastLearnedAt);
 }finally{f.worker.close();}
});
test('HTTP and JSON failures expose safe categories without raw response text',async()=>{
 for(const [error,kind] of [[new Error('API 返回 429：secret-key'),'http'],[new SyntaxError('secret-key invalid JSON'),'format'],[new Error('secret-key unexpected'),'unknown']]){
 const f=fixture(async()=>{throw error;});try{await f.worker.run();assert.equal(f.state.profile.errorKind,kind);assert(!f.state.profile.error.includes('secret-key'));assert.equal(f.state.persona.error,f.state.profile.error);}finally{f.worker.close();}
 }
});
test('the overall deadline still aborts and reports a timeout to both summary pages',async()=>{
 const f=fixture((_,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')))),{requestTimeout:5});
 try{await f.worker.run();assert.equal(f.state.profile.errorKind,'timeout');assert.equal(f.state.persona.error,f.state.profile.error);assert.equal(f.worker.timer,null);}finally{f.worker.close();}
});
test('upgrade releases the legacy failure once without retrying new classified failures on restart',()=>{
 const s=core.initialState(),p=profile.ensure(s);p.error='画像整理未完成，原有画像保留。可手动重试。';p.errorSignature=profile.signature(s);
 assert(profile.recoverLegacyFailure(s));assert.equal(p.error,undefined);assert.equal(p.errorSignature,undefined);assert(!profile.recoverLegacyFailure(s));
 p.error='服务商超时';p.errorKind='timeout';assert(!profile.recoverLegacyFailure(s));assert.equal(p.error,'服务商超时');
});
