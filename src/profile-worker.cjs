const profile=require('./profile.cjs');
const persona=require('./persona.cjs');
function failure(error,timeout,limit){
 if(timeout)return {kind:'timeout',message:`服务商在 ${Math.round(limit/1000)} 秒内未完成整理，已停止本次请求。原有画像保留，可以手动重试。`};
 const status=/^API 返回 (\d{3})[：:]/.exec(error?.message||'')?.[1];
 if(status)return {kind:'http',message:`整理接口返回 HTTP ${status}。${status==='401'?'请检查 API 密钥和权限。':status==='429'?'请求过于频繁或账户额度不足，请稍后重试。':'请检查服务商状态与模型配置。'}原有画像保留。`};
 if(error instanceof SyntaxError)return {kind:'format',message:'模型返回的整理结果不是完整有效的 JSON，未保存本次结果。请手动重试。'};
 if(error instanceof TypeError)return {kind:'network',message:'整理时网络连接失败或中断，原有画像保留。请检查网络后手动重试。'};
 if(error?.message==='画像缺少有效依据，请重试。'||error?.message==='画像内容格式不正确，请重试。')return {kind:'format',message:error.message};
 return {kind:'unknown',message:'整理未完成，原有画像保留。可手动重试；若持续失败，请检查服务商与模型配置。'};
}
class ProfileWorker{
 constructor({getState,ready,busy,extract,save,onIdle=()=>{},changed=()=>{},idleDelay=120000,manualDelay=1000,requestTimeout=300000}){Object.assign(this,{getState,ready,busy,extract,save,onIdle,changed,idleDelay,manualDelay,requestTimeout});this.active=null;this.timer=null;this.closed=false;this.manual=false;this.scope='both';}
 pause(){clearTimeout(this.timer);this.timer=null;this.active?.controller.abort();}
 schedule(manual=false,scope='both'){
  if(manual){this.manual=true;this.scope=scope;}
  clearTimeout(this.timer);this.timer=null;
  if(this.closed||this.active||this.busy()||!this.ready())return;
  const state=this.getState();if(!this.manual&&!profile.due(state))return;
  if(this.manual&&!profile.hasInput(state))return;
  this.timer=setTimeout(()=>{this.timer=null;void this.run();},this.manual?this.manualDelay:this.idleDelay);this.timer.unref?.();
 }
 async run(){
  if(this.closed||this.active||this.busy()||!this.ready())return;
  const state=this.getState();if(!this.manual&&!profile.due(state))return;
  const automatic=!this.manual;
  const requestInput={...profile.input(state),...profile.workFlags(state,automatic,this.scope)};if(!profile.hasInput(state))return;this.scope='both';
  const signature=profile.signature(state),job={controller:new AbortController(),phase:'connecting',startedAt:Date.now()};this.active=job;this.changed();this.manual=false;let timeout=false;
  const timer=setTimeout(()=>{timeout=true;job.controller.abort();},this.requestTimeout);
  const valid=()=>!this.closed&&this.getState()===state&&profile.signature(state)===signature&&(!automatic||profile.automaticEnabled(state));
  const progress=phase=>{if(this.active===job&&!job.controller.signal.aborted&&['connecting','thinking','receiving'].includes(phase)&&phase!==job.phase){job.phase=phase;this.changed();}};
  try{const result=await this.extract(requestInput,job.controller.signal,progress);if(job.controller.signal.aborted||!valid())return;profile.propose(state,result,requestInput);const p=profile.ensure(state);delete p.error;delete p.errorSignature;delete p.errorKind;this.save();}
  catch(error){if(valid()&&(!job.controller.signal.aborted||timeout)){const detail=failure(error,timeout,this.requestTimeout),p=profile.ensure(state);p.error=detail.message;p.errorKind=detail.kind;p.errorSignature=signature;if(requestInput.updateCompanion){const companion=persona.ensure(state);companion.error=detail.message;}this.save();}}
  finally{clearTimeout(timer);if(this.active===job)this.active=null;this.changed();this.schedule();this.onIdle();}
 }
 close(){this.closed=true;this.pause();}
}
module.exports={ProfileWorker};
