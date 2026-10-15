const crypto=require('node:crypto');
const categories=['daily','personality','story','family','people','support','values','together'];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=()=>new Date().toISOString();
function ensure(state){return state.profile ||= {current:[],questions:[],history:[],suppressed:[],lastInput:[],draft:null};}
function sources(state){return state.memories.filter(m=>m.status==='confirmed').map(m=>({id:m.id,hash:hash([m.id,m.text,m.category,m.source,m.updatedAt]),text:m.text.slice(0,2000)+(m.text.length>2000?'\n（此条已截断，仅依据明确完整的信息，不推断缺失部分。）':''),category:m.category}));}
function validEntry(entry,available){return entry.evidence?.length && entry.evidence.every(e=>available.get(e.id)?.hash===e.hash);}
function basisKey(e){return hash(['basis',e.category,e.kind,e.evidence]);}
function entryKey(e){return hash([e.category,e.kind,e.text,e.evidence]);}
function sync(state){
 const p=ensure(state),available=new Map(sources(state).map(m=>[m.id,m]));
 p.current=p.current.filter(e=>validEntry(e,available));
 if(p.questionInput?.some(e=>available.get(e.id)?.hash!==e.hash))p.questions=[];
 p.history.forEach(v=>{v.entries=v.entries.filter(e=>validEntry(e,available));});
 if(p.draft&&!p.draft.input.every(e=>available.get(e.id)?.hash===e.hash)){p.draft=null;delete p.error;}
 return p;
}
function input(state){
 const p=sync(state),all=sources(state),important=new Set(p.current.flatMap(e=>e.evidence.map(x=>x.id)));
 const selected=[...all.filter(m=>important.has(m.id)),...all.filter(m=>!important.has(m.id)).reverse()].slice(0,60).sort((a,b)=>a.id.localeCompare(b.id));
 return {memories:selected,understanding:p.current.map(e=>({category:e.category,text:e.text,kind:e.kind,sourceIds:e.evidence.map(x=>x.id)}))};
}
function signature(state){const p=ensure(state);return hash([sources(state).map(m=>[m.id,m.hash]).sort(),p.current,p.suppressed]);}
function due(state){
 const p=sync(state);if(p.error&&p.errorSignature&&p.errorSignature!==signature(state)){delete p.error;delete p.errorSignature;}if(state.settings.autoProfile===false||p.draft||p.error)return false;
 const all=sources(state);if(!all.length)return false;
 if(!p.lastGeneratedAt)return true;
 const previous=new Map(p.lastInput.map(e=>[e.id,e.hash]));
 return all.filter(m=>previous.get(m.id)!==m.hash).length>=5;
}
function propose(state,result,requestInput){
 if(!Array.isArray(result?.entries))throw Error('画像内容格式不正确，请重试。');
 const p=sync(state),available=new Map(requestInput.memories.map(m=>[m.id,m]));
 const seen=new Set(),entries=[];let grounded=0;
 for(const raw of result.entries.slice(0,12)){
  if(!categories.includes(raw.category)||typeof raw.text!=='string')continue;
  const ids=[...new Set(Array.isArray(raw.sourceIds)?raw.sourceIds:[])].slice(0,4);if(!ids.length||ids.some(id=>!available.has(id)))continue;
  const evidence=ids.sort().map(id=>available.get(id)).filter(Boolean).map(m=>({id:m.id,hash:m.hash}));
  const entry={id:crypto.randomUUID(),category:raw.category,text:raw.text.trim().slice(0,600),kind:raw.kind==='fact'?'fact':'inference',evidence};
  const key=entryKey(entry);
  if(!entry.text||!evidence.length)continue;grounded++;
  if(seen.has(key)||p.suppressed.includes(key)||p.suppressed.includes(basisKey(entry)))continue;
  seen.add(key);const existing=p.current.find(e=>entryKey(e)===key);if(existing)entry.id=existing.id;entries.push(entry);
 }
 if(result.entries.length&&!grounded)throw Error('画像缺少有效依据，请重试。');
 if(!entries.length&&p.current.length)entries.push(...structuredClone(p.current));
 const questions=(Array.isArray(result.questions)?result.questions:[]).slice(0,3).filter(q=>typeof q==='string'&&q.trim()).map(text=>({id:crypto.randomUUID(),text:text.trim().slice(0,180)}));
 p.lastInput=sources(state).map(m=>({id:m.id,hash:m.hash}));p.lastGeneratedAt=stamp();delete p.error;
 p.draft={id:crypto.randomUUID(),generatedAt:stamp(),entries,questions,input:requestInput.memories.map(m=>({id:m.id,hash:m.hash}))};
 return p.draft;
}
function approve(state,draftId,items,questionIds){
 const p=sync(state),draft=p.draft;if(!draft||draft.id!==draftId)throw Error('这份画像已更新，请重新查看。');
 const available=new Map(sources(state).map(m=>[m.id,m])),selected=new Map(items.map(x=>[x.id,x]));
 const entries=[];
 for(const e of draft.entries){const edit=selected.get(e.id);if(!edit)continue;
  const text=String(edit.text||'').trim().slice(0,600);if(!text||!validEntry(e,available))throw Error('判断或依据已失效，请重新整理。');
  entries.push({...e,text,kind:edit.kind==='fact'?'fact':'inference',confirmedAt:stamp()});
 }
 if(p.current.length)p.history.unshift({at:p.confirmedAt||stamp(),entries:structuredClone(p.current)});
 p.history=p.history.slice(0,20);
 for(const e of draft.entries)if(!selected.has(e.id)&&!p.current.some(c=>entryKey(c)===entryKey(e)))p.suppressed.push(entryKey(e),basisKey(e));
 p.suppressed=[...new Set(p.suppressed)].slice(-500);
 p.current=entries;p.questionInput=draft.input;p.questions=draft.questions.filter(q=>questionIds.includes(q.id));p.confirmedAt=stamp();p.draft=null;
}
function reject(state){const p=sync(state);if(p.draft)for(const e of p.draft.entries)if(!p.current.some(c=>entryKey(c)===entryKey(e)))p.suppressed.push(entryKey(e),basisKey(e));p.suppressed=[...new Set(p.suppressed)].slice(-500);p.draft=null;}
function remove(state,id){const p=sync(state),entry=p.current.find(e=>e.id===id);if(!entry)return;const key=entryKey(entry);p.suppressed=[...new Set([...p.suppressed,key,basisKey(entry)])].slice(-500);p.current=p.current.filter(e=>e.id!==id);p.history.forEach(v=>{v.entries=v.entries.filter(e=>e.id!==id&&entryKey(e)!==key);});p.questions=[];p.draft=null;}
function context(state,query){
 const p=sync(state),words=String(query).match(/[\p{Script=Han}]{2}|[a-z]{3,}/giu)||[];
 const entries=p.current.map(e=>({e,score:(e.category==='together'||e.category==='support'?2:0)+words.filter(w=>e.text.includes(w)).length})).sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.e);
 const turns=state.conversations.reduce((n,c)=>n+c.messages.filter(m=>m.role==='user').length,0);
 const canAsk=p.questions.length&&turns>=5&&turns-(p.lastQuestionTurn||-10)>=12&&(!p.lastQuestionAt||Date.now()-Date.parse(p.lastQuestionAt)>3*86400000);
 const question=canAsk?p.questions[(p.questionIndex||0)%p.questions.length]:null;
 return {entries,question};
}
function offered(state,id){const p=ensure(state);if(!p.questions.some(q=>q.id===id))return;p.lastQuestionTurn=state.conversations.reduce((n,c)=>n+c.messages.filter(m=>m.role==='user').length,0);p.lastQuestionAt=stamp();p.questionIndex=(p.questionIndex||0)+1;}
module.exports={ensure,sources,sync,input,signature,due,propose,approve,reject,remove,context,offered,entryKey};
