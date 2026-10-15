const core = require('./core.cjs');

// Keeps queued turns on disk until extraction succeeds. Chat always has priority.
class MemoryWorker {
  constructor({getState, extract, save, chatBusy, batchDelay=15000, idleDelay=120000, requestTimeout=90000,onIdle=()=>{}}) {
    Object.assign(this,{getState,extract,save,chatBusy,batchDelay,idleDelay,requestTimeout,onIdle});
    this.active=null; this.timer=null; this.closed=false;
  }
  enqueue(conversation, userMessage, assistantReply) {
    if (!conversation.remember || !this.getState().settings.extractMemory) return;
    conversation.memoryQueue ||= [];
    conversation.memoryQueue.push({id:core.id(),userMessage:userMessage.slice(0,10000),assistantReply:assistantReply.slice(0,10000)});
    delete conversation.memoryError;
  }
  pause(cid) {
    clearTimeout(this.timer); this.timer=null;
    if (this.active && (!cid || this.active.cid===cid)) this.active.controller.abort();
  }
  schedule() {
    clearTimeout(this.timer); this.timer=null;
    if (this.closed || this.active || this.chatBusy()) return;
    const state=this.getState();
    if (!state.settings.extractMemory) return;
    const c=state.conversations.find(c=>c.remember && c.memoryQueue?.length && !c.memoryError);
    if (!c) return;
    this.timer=setTimeout(()=>{this.timer=null;void this.run(c.id);},c.memoryQueue.length>=5?this.batchDelay:this.idleDelay);
    this.timer.unref?.();
  }
  async run(cid) {
    if (this.closed || this.active || this.chatBusy()) return;
    const state=this.getState(), c=state.conversations.find(c=>c.id===cid);
    if (!state.settings.extractMemory || !c?.remember || !c.memoryQueue?.length) return;
    const job={cid,batch:c.memoryQueue.slice(0,5),controller:new AbortController()};
    this.active=job;
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;job.controller.abort();},this.requestTimeout);
    const valid=()=>!job.controller.signal.aborted && !this.closed && this.getState()===state && state.settings.extractMemory && state.conversations.includes(c) && c.remember;
    try {
      const candidates=await this.extract(job.batch,job.controller.signal);
      if (!valid()) return;
      if (!Array.isArray(candidates)) throw new Error("Invalid memory response");
      core.addCandidates(state,candidates,cid);
      const completed=new Set(job.batch.map(t=>t.id));
      c.memoryQueue=c.memoryQueue.filter(t=>!completed.has(t.id));
      delete c.memoryError;
      this.save();
    } catch {
      if (valid()) {c.memoryError=true;this.save();}
    } finally {
      clearTimeout(timeout);
      if (timedOut && !this.closed && this.getState()===state && state.conversations.includes(c) && c.remember && state.settings.extractMemory) {c.memoryError=true;this.save();}
      if (this.active===job) this.active=null;
      this.schedule();this.onIdle();
    }
  }
  close() {this.closed=true;this.pause();}
}
module.exports={MemoryWorker};
