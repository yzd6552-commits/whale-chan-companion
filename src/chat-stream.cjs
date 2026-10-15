// Compatible gateways use different names; prefer one representation per packet.
function reasoningText(message){
 const text=value=>typeof value==='string'?value:Array.isArray(value)?value.filter(p=>p&&['text','reasoning'].includes(p.type)&&typeof p.text==='string').map(p=>p.text).join(''):'';
 for(const key of ['reasoning_content','reasoning']){const result=text(message?.[key]);if(result)return result;}
 return Array.isArray(message?.reasoning_details)?message.reasoning_details.filter(p=>p&&p.type==='reasoning.text'&&typeof p.text==='string').map(p=>p.text).join(''):'';
}
// Decode data-only SSE without assuming network chunks align with events or UTF-8.
async function readChatStream(response, onText, onUsage=()=>{},onReasoning=()=>{}) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const result=await response.json();onUsage(result.usage);
    const reasoning=reasoningText(result.choices?.[0]?.message);
    if(typeof reasoning==='string'&&reasoning)onReasoning(reasoning.slice(0,100000));
    const answer=result.choices?.[0]?.message?.content;
    if (typeof answer!=='string'||!answer.trim()) throw Error('模型没有返回文本回复。');
    const text=answer.slice(0,100000);onText(text);return text;
  }
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buffer='',answer='',ended=false,finished=false,reasoningLength=0;
  function event(raw) {
    const data=raw.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data)return;
    if(data.trim()==='[DONE]'){ended=true;return;}
    let packet;try{packet=JSON.parse(data);}catch{throw Error('模型返回的流式数据格式不正确。');}
    if(packet.error)throw Error('模型流式回复出错，请稍后重试。');
    if(packet.usage)onUsage(packet.usage);
    const choice=packet.choices?.[0];
    if(choice?.finish_reason!=null)finished=true;
    const reasoning=reasoningText(choice?.delta);
    if(typeof reasoning==='string'&&reasoning&&reasoningLength<100000){const piece=reasoning.slice(0,100000-reasoningLength);reasoningLength+=piece.length;onReasoning(piece);}
    const text=choice?.delta?.content;
    if(typeof text==='string'&&text){
      if(answer.length+text.length>100000)throw Error('回复过长，已保留收到的内容。');
      answer+=text;onText(text);
    }
  }
  try {
    while(!ended){
      const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      let match;while((match=/\r?\n\r?\n/.exec(buffer))){const raw=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);event(raw);if(ended)break;}
      if(buffer.length>1000000)throw Error('模型返回的流式数据过大。');
      if(done){if(buffer.trim())event(buffer);break;}
    }
    if(!ended&&!finished)throw Error('连接提前中断，已保留收到的回复，请重试。');
    if(!answer.trim())throw Error('模型没有返回文本回复。');
    return answer;
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
module.exports={readChatStream,reasoningText};
