const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readChatStream}=require('../src/chat-stream.cjs');
const packet=text=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]})+'\r\n\r\n';
function response(text){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}),{headers:{'content-type':'text/event-stream'}});}
test('streams UTF-8 split across bytes, SSE comments and CRLF without leaking reasoning',async()=>{
 const pieces=[];const input=': keepalive\r\n\r\ndata: {"choices":[{"delta":{"reasoning_content":"private"}}]}\r\n\r\n'+packet('你好🐳')+packet('，我在。')+'data: [DONE]\r\n\r\n';
 assert.equal(await readChatStream(response(input),s=>pieces.push(s)),'你好🐳，我在。');assert.deepEqual(pieces,['你好🐳','，我在。']);
});
test('first text is delivered before the server completes',async()=>{
 let finish;const r=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(packet('先看到这句')));finish=()=>{c.enqueue(new TextEncoder().encode(packet('再看到这句')+'data: [DONE]\n\n'));c.close();};}}),{headers:{'content-type':'text/event-stream'}});
 let first;const ready=new Promise(r=>first=r);const result=readChatStream(r,first);assert.equal(await ready,'先看到这句');finish();assert.equal(await result,'先看到这句再看到这句');
});
test('accepts regular JSON from gateways that ignore stream option',async()=>{
 const pieces=[];assert.equal(await readChatStream(Response.json({choices:[{message:{content:'兼容回复'}}]}),s=>pieces.push(s)),'兼容回复');assert.deepEqual(pieces,['兼容回复']);
});
test('truncated stream retains delivered pieces but reports interruption',async()=>{
 const pieces=[];await assert.rejects(readChatStream(response(packet('未完成')),s=>pieces.push(s)),/提前中断/);assert.deepEqual(pieces,['未完成']);
});
test('stream errors are sanitized and invalid data is rejected',async()=>{
 await assert.rejects(readChatStream(response('data: {"error":{"message":"secret-key"}}\n\n'),()=>{}),e=>!e.message.includes('secret-key'));
 await assert.rejects(readChatStream(response('data: bad-json\n\n'),()=>{}),/格式/);
});
