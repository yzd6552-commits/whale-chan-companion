// Decode data-only SSE without assuming network chunks align with events or UTF-8.
async function readChatStream(response, onText) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const answer=(await response.json()).choices?.[0]?.message?.content;
    if (typeof answer!=='string'||!answer.trim()) throw Error('模型没有返回文本回复。');
    const text=answer.slice(0,100000);onText(text);return text;
  }
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buffer='',answer='',ended=false,finished=false;
  function event(raw) {
    const data=raw.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data)return;
    if(data.trim()==='[DONE]'){ended=true;return;}
    let packet;try{packet=JSON.parse(data);}catch{throw Error('模型返回的流式数据格式不正确。');}
    if(packet.error)throw Error('模型流式回复出错，请稍后重试。');
    const choice=packet.choices?.[0];
    if(choice?.finish_reason!=null)finished=true;
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
module.exports={readChatStream};
