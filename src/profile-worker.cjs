const profile=require('./profile.cjs');
class ProfileWorker{
 constructor({getState,ready,busy,extract,save,onIdle=()=>{},changed=()=>{},idleDelay=120000,manualDelay=1000,requestTimeout=90000}){Object.assign(this,{getState,ready,busy,extract,save,onIdle,changed,idleDelay,manualDelay,requestTimeout});this.active=null;this.timer=null;this.closed=false;this.manual=false;}
 pause(){clearTimeout(this.timer);this.timer=null;this.active?.controller.abort();}
 schedule(manual=false){
  if(manual)this.manual=true;
  clearTimeout(this.timer);this.timer=null;
  if(this.closed||this.active||this.busy()||!this.ready())return;
  const state=this.getState();if(!this.manual&&!profile.due(state))return;
  if(this.manual&&!profile.sources(state).length)return;
  this.timer=setTimeout(()=>{this.timer=null;void this.run();},this.manual?this.manualDelay:this.idleDelay);this.timer.unref?.();
 }
 async run(){
  if(this.closed||this.active||this.busy()||!this.ready())return;
  const state=this.getState();if(!this.manual&&!profile.due(state))return;
  const requestInput=profile.input(state);if(!requestInput.memories.length)return;
  const automatic=!this.manual;
  const signature=profile.signature(state),job={controller:new AbortController()};this.active=job;this.changed();this.manual=false;let timeout=false;
  const timer=setTimeout(()=>{timeout=true;job.controller.abort();},this.requestTimeout);
  const valid=()=>!this.closed&&this.getState()===state&&profile.signature(state)===signature&&(!automatic||state.settings.autoProfile!==false);
  try{const result=await this.extract(requestInput,job.controller.signal);if(job.controller.signal.aborted||!valid())return;profile.propose(state,result,requestInput);this.save();}
  catch{if(valid()&&(!job.controller.signal.aborted||timeout)){profile.ensure(state).error='画像整理未完成，原有画像保留。可手动重试。';profile.ensure(state).errorSignature=signature;this.save();}}
  finally{clearTimeout(timer);if(this.active===job)this.active=null;this.changed();this.schedule();this.onIdle();}
 }
 close(){this.closed=true;this.pause();}
}
module.exports={ProfileWorker};
