const kinds=['chat','memory','connection','profile'];
function normalizeUsage(raw) {
  const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
  if(!raw||!valid(raw.prompt_tokens)||!valid(raw.completion_tokens))return null;
  return {input:raw.prompt_tokens,output:raw.completion_tokens,total:valid(raw.total_tokens)?raw.total_tokens:raw.prompt_tokens+raw.completion_tokens,...(valid(raw.completion_tokens_details?.reasoning_tokens)?{reasoning:raw.completion_tokens_details.reasoning_tokens}:{})};
}
function usageDay(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function recordUsage(state,raw,kind='chat',date=new Date()) {
  if(!kinds.includes(kind))throw Error('Unknown usage kind');
  const usage=normalizeUsage(raw);
  state.usage ||= {since:new Date().toISOString(),byKind:{}};
  state.usage.days ||= {};
  const daily=state.usage.days[usageDay(date)] ||= {};
  for(const group of [state.usage.byKind,daily]){
    const totals=group[kind] ||= {input:0,output:0,total:0,reported:0,unreported:0};
    if(usage){for(const field of ['input','output','total'])totals[field]+=usage[field];totals.reported++;}
    else totals.unreported++;
  }
  return usage;
}
module.exports={normalizeUsage,recordUsage,usageDay};
