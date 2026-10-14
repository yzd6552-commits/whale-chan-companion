const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MemoryWorker}=require('../src/memory-worker.cjs');
function fixture(extract,options={}) {
  let state={settings:{extractMemory:true},conversations:[{id:'c',remember:true}],memories:[]},saves=0;
  const worker=new MemoryWorker({getState:()=>state,chatBusy:()=>false,save:()=>saves++,extract,...options});
  return {worker,get state(){return state;},replace:()=>state={...state},get saves(){return saves;},c:state.conversations[0]};
}
test('queues turns without calling API; batches five and preserves remainder',async()=>{
  let calls=0;const f=fixture(async turns=>{calls++;assert.equal(turns.length,5);return [{text:'用户表示喜欢散步',category:'daily'}];});
  try {for(let i=0;i<6;i++)f.worker.enqueue(f.c,'故事'+i,'回复');assert.equal(calls,0);
    await f.worker.run('c');assert.equal(calls,1);assert.equal(f.c.memoryQueue.length,1);assert.equal(f.state.memories[0].status,'pending');assert.equal(f.saves,1);
  }finally{f.worker.close();}
});
test('chat priority aborts extraction; late response cannot consume queue or add memory',async()=>{
  let resolve,signal;const f=fixture((_,s)=>{signal=s;return new Promise(r=>resolve=r);});
  try {f.worker.enqueue(f.c,'故事','回复');const running=f.worker.run('c');f.worker.pause();assert(signal.aborted);
    resolve([{text:'用户表示喜欢散步',category:'daily'}]);await running;assert.equal(f.c.memoryQueue.length,1);assert.equal(f.state.memories.length,0);
  }finally{f.worker.close();}
});
test('reset or revoked consent invalidates an in-flight response',async()=>{
  for(const invalidate of [f=>f.replace(),f=>f.c.remember=false,f=>f.state.settings.extractMemory=false,f=>f.state.conversations=[]]) {
    let resolve;const f=fixture(()=>new Promise(r=>resolve=r));
    try {f.worker.enqueue(f.c,'故事','回复');const running=f.worker.run('c');invalidate(f);resolve([{text:'用户表示喜欢散步',category:'daily'}]);await running;assert.equal(f.state.memories.length,0);assert.equal(f.saves,0);}
    finally{f.worker.close();}
  }
});
test('failed or malformed response retains queue; new chat permits retry',async()=>{
  for(const extract of [async()=>{throw Error('network');},async()=>undefined]) {
    const f=fixture(extract);try {f.worker.enqueue(f.c,'故事','回复');await f.worker.run('c');assert(f.c.memoryError);assert.equal(f.c.memoryQueue.length,1);assert.equal(f.worker.timer,null);
      f.worker.enqueue(f.c,'新的故事','回复');assert.equal(f.c.memoryError,undefined);
    }finally{f.worker.close();}
  }
});
test('timeout retains queue and stops automatic retry loop',async()=>{
  const f=fixture((_,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('abort')))),{requestTimeout:5});
  try {f.worker.enqueue(f.c,'故事','回复');await f.worker.run('c');assert(f.c.memoryError);assert.equal(f.c.memoryQueue.length,1);assert.equal(f.worker.timer,null);}finally{f.worker.close();}
});
test('persisted queue resumes after restart when idle',async()=>{
  const f=fixture(async()=>[],{idleDelay:5});try {f.c.memoryQueue=[{id:'old',userMessage:'故事',assistantReply:'回复'}];f.worker.schedule();
    await new Promise(r=>setTimeout(r,30));assert.equal(f.c.memoryQueue.length,0);assert.equal(f.saves,1);
  }finally{f.worker.close();}
});
