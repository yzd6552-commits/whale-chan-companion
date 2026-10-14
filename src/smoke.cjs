// Runs only with --smoke-test in an isolated temporary userData directory.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
async function run(win,app){
  let server;
  const out=path.join(process.cwd(),'test-output');fs.mkdirSync(out,{recursive:true});
  const execute=code=>win.webContents.executeJavaScript(code,true);
  const capture=async name=>{
    await new Promise(r=>setTimeout(r,700));
    const image=await win.capturePage();fs.writeFileSync(path.join(out,name),image.toPNG());
  };
  const waitFor=async code=>{for(let i=0;i<100;i++){if(await execute(code))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out: '+code);};
  try{
    await waitFor(`!!document.querySelector('#start-onboarding')`);
    await waitFor(`[...document.images].every(image=>image.complete && image.naturalWidth>0)`);
    await capture('01-welcome.png');
    win.setSize(900,650);
    await capture('01-welcome-small.png');
    win.setSize(1240,850);
    await execute(`document.querySelector('#start-onboarding').click()`);
    await capture('02-chapters.png');
    await execute(`document.querySelector('[data-section="0"]').click();document.querySelector('#answer-input').value='测试用户椰子';document.querySelector('#answer-input').dispatchEvent(new Event('input'));`);
    await waitFor(`document.querySelector('#save-status').textContent==='已保存于本机'`);
    await capture('02-question.png');
    await execute(`document.querySelector('#back-chapters').click()`);
    await waitFor(`!!document.querySelector('#review-answers')`);
    await execute(`document.querySelector('#review-answers').click();document.querySelector('#confirm-answers').click()`);
    await waitFor(`document.querySelector('.review-card .mini').textContent.includes('已确认')`);
    let snapshot=await execute(`window.companion.call('state')`);assert.equal(snapshot.memories.length,1);
    assert.equal(snapshot.answers['daily.name'].text,'测试用户椰子');
    await execute(`document.querySelector('[data-page="memories"]').click()`);
    await waitFor(`!!document.querySelector('.memory-card')`);
    await capture('03-memories.png');
    await execute(`document.querySelector('[data-edit-memory]').click();document.querySelector('#memory-text').value='用户希望先倾听，再给建议。';document.querySelector('#save-memory').click();`);
    await waitFor(`!document.querySelector('#modal').open`);
    snapshot=await execute(`window.companion.call('state')`);assert(snapshot.memories[0].text.includes('先倾听'));
    const requests=[];let fail=false,slow=false;
    server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{
      const payload=JSON.parse(body);requests.push(payload);
      if(fail){res.writeHead(401);res.end(JSON.stringify({error:'never surface test-key'}));return;}
      const extract=payload.messages[0].content.includes('最多3条');
      if(payload.stream){
        res.setHeader('Content-Type','text/event-stream');
        const chunk=text=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]})+'\n\n';
        res.write(chunk('我在听。'));
        if(slow)return; // cancellation after partial text
        const timer=setTimeout(()=>res.end(chunk('你愿意从今天发生的事开始说吗？')+'data: '+JSON.stringify({choices:[],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}})+'\n\ndata: [DONE]\n\n'),1200);
        res.on('close',()=>clearTimeout(timer));return;
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({usage:{prompt_tokens:40,completion_tokens:5,total_tokens:45},choices:[{message:{content:extract?JSON.stringify({memories:[{text:'用户表示喜欢散步',category:'daily'}]}):'我在听。你愿意从今天发生的事开始说吗？'}}]}));
    });});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/v1';
    await execute(`document.querySelector('[data-page="settings"]').click()`);
    await waitFor(`!!document.querySelector('#settings-form')`);
    await capture('04-settings.png');
    await execute(`document.querySelector('#base-url').value=${JSON.stringify(base)};document.querySelector('#model-name').value='test-model';document.querySelector('#api-key').value='test-key';document.querySelector('#settings-form').requestSubmit();`);
    await waitFor(`document.querySelector('#api-key').placeholder.includes('留空')`);
    snapshot=await execute(`window.companion.call('state')`);assert(snapshot.hasKey);assert(!JSON.stringify(snapshot).includes('test-key'));
    await execute(`document.querySelector('#new-conversation').click()`);
    await waitFor(`!!document.querySelector('#message-input')`);
    await execute(`document.querySelector('#message-input').value='我喜欢散步，先听我说。';document.querySelector('#send-message').click();`);
    await waitFor(`document.querySelector('.message.assistant .message-content')?.textContent==='我在听。'&&document.querySelector('#send-message').textContent==='停止生成'`);
    assert.equal(requests.length,1);assert.equal(requests[0].stream,true);assert.equal(requests[0].stream_options.include_usage,true);
    await capture('05-streaming-reply.png');
    await waitFor(`document.querySelector('#send-message').textContent==='发送 ↑'&&!!document.querySelector('.message.assistant')`);
    assert.equal(requests.length,1);
    snapshot=await execute(`window.companion.call('state')`);assert.equal(snapshot.conversations.at(-1).memoryQueue.length,1);
    await waitFor(`window.companion.call('state').then(s=>s.memories.some(m=>m.status==='pending'))`);
    assert.equal(requests.length,2);assert(requests[0].messages[0].content.includes('先倾听'));
    snapshot=await execute(`window.companion.call('state')`);assert.equal(snapshot.memories.filter(m=>m.status==='pending').length,1);
    assert.equal(snapshot.usage.byKind.chat.total,120);assert.equal(snapshot.usage.byKind.memory.total,45);
    assert.equal(snapshot.usage.days[snapshot.usageDay].chat.total,120);
    assert((await execute(`document.querySelector('.message-usage').textContent`)).includes('120'));
    assert((await execute(`document.querySelector('#today-usage').textContent`)).includes('165'));
    await capture('05-chat-test-service.png');
    await execute(`document.querySelector('#remember-chat').click()`);
    await waitFor(`!document.querySelector('#remember-chat').checked`);
    await execute(`document.querySelector('#message-input').value='这一句不要整理记忆。';document.querySelector('#send-message').click()`);
    await waitFor(`document.querySelectorAll('.message.assistant').length===2&&document.querySelector('#send-message').textContent==='发送 ↑'`);
    assert.equal(requests.length,3);
    fail=true;
    await execute(`document.querySelector('#message-input').value='测试错误';document.querySelector('#send-message').click()`);
    await waitFor(`!!document.querySelector('.error-box')`);
    assert((await execute(`document.querySelector('.error-box').textContent`)).includes('401'));
    assert(!(await execute(`document.querySelector('.error-box').textContent`)).includes('test-key'));
    fail=false;slow=true;
    await execute(`document.querySelector('#retry-message').click()`);
    await waitFor(`document.querySelector('#send-message').textContent==='停止生成'&&document.querySelectorAll('.message.assistant').length===3`);
    await execute(`document.querySelector('#send-message').click()`);
    await waitFor(`!!document.querySelector('.error-box')&&document.querySelector('#send-message').textContent==='发送 ↑'`);
    snapshot=await execute(`window.companion.call('state')`);assert(snapshot.conversations.some(c=>c.messages.at(-1)?.partial));assert.equal(snapshot.usage.byKind.chat.unreported,2);
    await win.webContents.reload();await waitFor(`!!document.querySelector('#start-onboarding')`);
    snapshot=await execute(`window.companion.call('state')`);assert(snapshot.conversations.some(c=>c.messages.some(m=>m.role==='assistant')));assert.equal(snapshot.usage.byKind.chat.total,240);
    await execute(`document.querySelector('[data-page="settings"]').click()`);
    await waitFor(`!!document.querySelector('#usage-panel')`);
    assert((await execute(`document.querySelector('#usage-panel').textContent`)).includes('285'));
    await capture('06-token-usage.png');
    console.log('SMOKE PASS: questionnaire, review, memory edit, encrypted-key config, API request, memory extraction, opt-out, failure, cancellation, reload.');
    server.closeAllConnections();server.close();app.exit(0);
  }catch(e){console.error('SMOKE FAIL',e);if(server){server.closeAllConnections();server.close();}app.exit(1);}
}
module.exports={run};
