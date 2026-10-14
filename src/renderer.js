/* The renderer has no filesystem or network access. All privileged work uses fixed IPC. */
const api = window.companion;
const sections = window.QUESTION_SECTIONS;
const questions = sections.flatMap(s => s.questions);
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc = escapeHtml;
let state, page='chat', currentId, questionIndex=null, reviewing=false, memoryTab='confirmed', search='', generating=false, generatingId=null, stage='', sendError='', pendingSave=Promise.resolve(), toastTimer;
let memoryDraft=null;
function toast(message) {$('#toast').textContent=message; $('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
async function call(channel,...args) {try {return await api.call(channel,...args);} catch(e) {throw new Error(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}}
async function safe(fn) {try {await fn();}catch(e){toast(e.message);}}
function confirmed() {return state.memories.filter(m=>m.status==='confirmed');}
function answered(q) {const a=state.answers[q.id];return a && (a.skipped || a.text.trim());}
function topbar(label,right='') {return `<header class="topbar"><div class="breadcrumb">我们的空间 <span> / </span> <strong>${label}</strong></div>${right||'<span class="badge">仅存于本机</span>'}</header>`;}
function header(title,subtitle,action='') {return `<div class="page-header"><div><div class="eyebrow">A LITTLE CLOSER, EVERY DAY</div><h1>${title}</h1><p class="muted">${subtitle}</p></div>${action}</div>`;}
function updateSidebar() {
  $$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const count=questions.filter(answered).length;
  $('#question-count').textContent=count ? `${count}/48` : '';
  const pending=state.memories.filter(m=>m.status==='pending').length;
  $('#pending-count').textContent=pending||'';
  $('#conversation-list').innerHTML=state.conversations.length ? state.conversations.map(c=>`<div class="conversation-row ${currentId===c.id&&page==='chat'?'selected':''}"><button class="choose-conv" data-conv="${c.id}">◌ &nbsp; ${esc(c.title)}</button><button class="remove-conv" data-delete-conv="${c.id}" aria-label="删除对话">×</button></div>`).join('') : '<div class="empty-small">在这里，慢慢积累<br>属于我们的对话。</div>';
  $$('[data-conv]').forEach(b=>b.onclick=()=>safe(async()=>{await pendingSave;currentId=b.dataset.conv;page='chat';sendError='';render();}));
  $$('[data-delete-conv]').forEach(b=>b.onclick=()=>confirmDialog('删除这段对话？','聊天记录会从本机移除。已经确认的长期记忆仍会保留，可在记忆页单独删除。',async()=>{state=await call('conversation-delete',b.dataset.deleteConv);if(currentId===b.dataset.deleteConv)currentId=null;render();}));
}
function render() {
  updateSidebar();
  if(page==='chat')renderChat();
  if(page==='onboarding')reviewing?renderReview():questionIndex===null?renderOnboarding():renderQuestion();
  if(page==='memories')renderMemories();
  if(page==='settings')renderSettings();
}
function renderChat() {
  const c=state.conversations.find(c=>c.id===currentId);
  const messages=c?.messages||[];
  const right=`<label class="check"><input id="remember-chat" type="checkbox" ${c?.remember!==false?'checked':''} ${generating?'disabled':''}>允许整理待确认记忆</label>`;
  $('#main').innerHTML=`<section class="chat-page">${topbar('一起聊聊',right)}<div class="chat-body" id="chat-body">${messages.length?`<div class="chat-feed">${messages.map(m=>`<article class="message ${m.role}" data-message="${esc(m.id)}"><div class="avatar">${m.role==='user'?'你':'<img src="assets/whale/avatar.png" alt="鲸鱼娘">'}</div><div><div class="message-label">${m.role==='user'?'你':'鲸鱼娘'}${m.partial?(generating&&generatingId===c.id?' · 正在回复':' · 未完成'):''}</div><div class="message-content ${m.partial&&generating&&generatingId===c.id?'streaming':''}">${esc(m.content)}</div></div></article>`).join('')}${generating&&generatingId===c?.id?`<div class="status-text" role="status">◌ &nbsp;${esc(stage||'正在认真读你的话…')}</div>`:''}</div>`:welcome()}${sendError?`<div class="error-box">${esc(sendError)} <button class="text-button" id="retry-message">重试上一条</button></div>`:''}</div><div class="composer-wrap"><div class="composer"><textarea id="message-input" aria-label="消息" placeholder="今天，想从什么聊起？" maxlength="20000" ${generating?'disabled':''}></textarea><div class="composer-actions"><button id="preview-message" class="text-button">查看本次发送内容</button><button id="send-message" class="button">${generating?'停止生成':'发送 ↑'}</button></div></div><div class="composer-footer">聊天记录保存在本机 · 回复通过你选择的模型 API 生成${!state.hasKey?' · 请先在设置中连接模型':''}<br>Enter 发送，Shift + Enter 换行 · AI 可能理解错，你随时可以纠正它。</div></div></section>`;
  $('#send-message').onclick=()=>generating?safe(()=>call('stop')):safe(()=>send());
  $('#message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!generating)safe(()=>send());}};
  $('#preview-message').onclick=()=>safe(()=>preview());
  $('#remember-chat').onchange=e=>safe(async()=>{if(!currentId)currentId=await call('conversation-new');state=await call('conversation-remember',currentId,e.target.checked);toast(e.target.checked?'新理解会先进入待确认记忆。':'本次对话不提取记忆；聊天记录仍保存在本机。');updateSidebar();});
  if($('#retry-message'))$('#retry-message').onclick=()=>safe(async()=>{const text=await call('retry',currentId);sendError='';await send(text);});
  $$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#message-input').value=b.dataset.prompt;$('#message-input').focus();});
  if($('#start-onboarding'))$('#start-onboarding').onclick=()=>{page='onboarding';render();};
  if($('#configure-api'))$('#configure-api').onclick=()=>{page='settings';render();};
  const body=$('#chat-body');if(messages.length)body.scrollTop=body.scrollHeight;
}
function welcome(){return `<div class="welcome"><div class="whale-hero"><div class="hero-copy"><div class="eyebrow">WHALE-CHAN · YOUR LITTLE COMPANION</div><h1>今天，也想<span>多懂你一点。</span></h1><p class="muted">小事、心事，或是突然冒出来的念头，<br>都可以慢慢说给我听。</p></div><div class="hero-character"><i class="hero-star one" aria-hidden="true">✦</i><i class="hero-star two" aria-hidden="true">✧</i><img src="assets/whale/delighted.png" alt="托着脸认真听你说话的Q版DeepSeek鲸鱼娘"><span class="hero-bubble">小鲸鱼准备好听啦！</span></div></div><div class="intro-card"><div class="intro-symbol">✧</div><div><h3>${confirmed().length?'你的故事，小鲸鱼有好好记着':'先递给小鲸鱼一份「关于你」'}</h3><p>8 个章节，48 个问题。性格、经历，还有重要的人。<br>随时暂停，只留下你愿意让我记住的部分。</p></div><button class="button secondary" id="start-onboarding">${questions.some(answered)?'继续认识':'开始认识'} ↗</button></div><div class="suggestions"><button class="suggestion" data-prompt="今天发生了一些事，我想跟你聊聊。"><i class="suggestion-icon" aria-hidden="true">☁</i>今天的小日常<span>一点小事，也想听</span></button><button class="suggestion" data-prompt="我想让你了解现在的我，你可以一次问我一个问题。"><i class="suggestion-icon" aria-hidden="true">✧</i>再认识我一点<span>从最近的生活开始</span></button><button class="suggestion" data-prompt="先听我说说，暂时不用急着给建议。"><i class="suggestion-icon" aria-hidden="true">♡</i>陪我待一会儿<span>不用急着想办法</span></button></div>${!state.hasKey?'<p class="mini" style="margin-top:22px">问卷可以离线填写。想开聊的话，<button class="text-button" id="configure-api">先连接模型 API ↗</button></p>':''}</div>`;}
async function ensureConversation(){if(!currentId){const remember=$('#remember-chat')?.checked!==false;currentId=await call('conversation-new');state=await call('state');if(!remember)state=await call('conversation-remember',currentId,false);}}
async function send(input,expected){
  const text=typeof input==='string'?input:$('#message-input').value.trim();if(!text)return;
  if(!state.hasKey){toast('请先连接模型 API；问卷可以先离线填写。');page='settings';render();return;}
  await ensureConversation();generating=true;generatingId=currentId;stage='正在认真读你的话…';sendError='';render();
  try{const result=await call('send',currentId,text,expected);if(result.warning)toast(result.warning);}catch(e){sendError=e.message;}finally{generating=false;generatingId=null;state=await call('state');if(page==='chat')renderChat();updateSidebar();}
}
async function preview(){
  const text=$('#message-input').value.trim();if(!text){toast('先写一句话，再查看本次会发送什么。');return;}
  await ensureConversation();const p=await call('preview',currentId,text);
  modal(`<h2>这次会发送什么？</h2><p class="muted">目标：${esc(p.baseUrl||'尚未配置')}<br>模型：${esc(p.model||'尚未配置')} · ${p.memories.length} 条已确认记忆<br>${p.extract?'这轮对话会加入本地队列，空闲时按批发送最多 5 轮对话和已有记忆摘要，整理待确认记忆；这会产生额外 API 调用，不阻塞聊天。':'本次不进行记忆提取。'}</p><p class="mini">以下是聊天请求的完整 messages 内容，不包含 API 密钥。</p><pre class="payload-preview">${esc(JSON.stringify(p.messages,null,2))}</pre><div class="dialog-footer"><button class="button secondary" id="close-preview">返回修改</button><button class="button" id="confirm-send">发送这条消息 ↑</button></div>`);
  $('#close-preview').onclick=closeModal;$('#confirm-send').onclick=()=>{closeModal();safe(()=>send(text,JSON.stringify(p.messages)));};
}
function renderOnboarding(){
  const count=questions.filter(answered).length;
  $('#main').innerHTML=topbar('初次认识')+`<div class="content">${header('先认识你，再慢慢懂你。','不必一次说完，也没有标准答案。你决定分享多少。','<button class="button secondary" id="review-answers">回顾与确认 ↗</button>')}<div class="stats"><span><strong>${count}</strong>/ 48 已经过的问题</span><span><strong>${state.memories.filter(m=>m.questionId).length}</strong>条已确认问卷记忆</span></div><div class="chapter-grid">${sections.map((s,i)=>`<button class="chapter" data-section="${i}"><div class="chapter-top"><span class="chapter-number">${s.icon}</span><span class="chapter-count">${s.questions.filter(answered).length} / 6 &nbsp; ↗</span></div><h3>${esc(s.title)}</h3><p>${esc(s.subtitle)}</p><div class="progress-track"><span style="width:${s.questions.filter(answered).length/6*100}%"></span></div></button>`).join('')}</div><div class="notice">回答会自动保存为本地草稿，不会发送给模型。<br>你确认纳入记忆后，相关内容才可能随聊天发送给你选择的 API。任何问题都可以跳过。</div></div>`;
  $$('[data-section]').forEach(b=>b.onclick=()=>{const s=sections[Number(b.dataset.section)];const q=s.questions.find(q=>!answered(q))||s.questions[0];questionIndex=questions.indexOf(q);render();});
  $('#review-answers').onclick=()=>{reviewing=true;render();};
}
function renderQuestion(){
  const q=questions[questionIndex],section=sections.find(s=>s.id===q.category),a=state.answers[q.id]||{text:'',remember:true};
  const qi=section.questions.indexOf(q);
  $('#main').innerHTML=topbar('初次认识 / '+esc(section.title))+`<div class="content"><div class="question-layout"><button class="back" id="back-chapters">← 返回章节 · 随时继续</button><div class="question-progress"><span>CHAPTER ${section.icon} · ${esc(section.title)}</span><span>${qi+1} / 6</span></div><div class="progress-track"><span style="width:${(qi+1)/6*100}%"></span></div><div class="question-companion"><img src="assets/whale/avatar.png" alt="鲸鱼娘"><span>慢慢说，这里没有标准答案。</span></div><h1>${esc(q.title)}</h1><p class="muted">${esc(q.hint)}</p>${q.choices.length?`<div class="choices">${q.choices.map(c=>`<button class="choice ${a.text.includes(c)?'selected':''}" data-choice="${esc(c)}">${esc(c)}</button>`).join('')}</div>`:''}<textarea id="answer-input" class="answer-input" maxlength="10000" placeholder="从你愿意说的地方开始……">${esc(a.text)}</textarea><div class="answer-options"><label class="check"><input type="checkbox" id="answer-remember" ${a.remember?'checked':''}>允许在回顾后纳入长期记忆</label><span class="save-status" id="save-status">${a.updatedAt?'已保存于本机':'仅保存在本机'}</span></div><div class="question-buttons"><button class="button secondary" id="prev-question" ${questionIndex===0?'disabled':''}>← 上一题</button><div class="actions"><button class="button ghost" id="skip-question">跳过这题</button><button class="button" id="next-question">${qi===5?'本章回顾 ↗':'保存并继续 →'}</button></div></div><div class="notice">这里只收集你的自述，不会把回答当成人格诊断。<br>修改已确认的回答后，需要重新确认对应记忆。</div></div></div>`;
  const save=()=>queueAnswer(q,false);
  $('#answer-input').oninput=save;$('#answer-remember').onchange=save;
  $$('[data-choice]').forEach(b=>b.onclick=()=>{const input=$('#answer-input');input.value=input.value.trim()?input.value+'；'+b.dataset.choice:b.dataset.choice;b.classList.add('selected');save();});
  $('#back-chapters').onclick=()=>safe(async()=>{await queueAnswer(q,false);questionIndex=null;render();});
  $('#prev-question').onclick=()=>safe(async()=>{await queueAnswer(q,false);questionIndex--;render();});
  $('#next-question').onclick=()=>safe(async()=>{await queueAnswer(q,false);if(qi===5){questionIndex=null;reviewing=true;}else questionIndex++;render();});
  $('#skip-question').onclick=()=>safe(async()=>{await queueAnswer(q,true);if(qi===5){questionIndex=null;reviewing=true;}else questionIndex++;render();});
}
function queueAnswer(q,skipped){
  const text=$('#answer-input').value,remember=$('#answer-remember').checked;
  const current=state.answers[q.id];
  if(!skipped&&current&&current.text===text&&current.remember===remember&&!current.skipped)return pendingSave;
  $('#save-status').textContent='正在保存…';
  pendingSave=pendingSave.catch(()=>{}).then(async()=>{state=await call('answer',q.id,{text,remember,skipped});if($('#save-status')&&questionIndex!==null&&questions[questionIndex].id===q.id)$('#save-status').textContent='已保存于本机';updateSidebar();}).catch(e=>{toast('保存失败：'+e.message);throw e;});
  return pendingSave;
}
function renderReview(){
  const filled=questions.filter(q=>state.answers[q.id]?.text.trim()&&!state.answers[q.id].skipped);
  $('#main').innerHTML=topbar('初次认识 / 回顾与确认')+`<div class="content"><button class="back" id="back-review">← 返回章节</button>${header('这些，是你愿意让我记住的吗？','原话会作为你的自述保存。取消勾选，也能撤销此前确认的问卷记忆。')}<div class="actions" style="margin-bottom:24px"><button class="button" id="confirm-answers" ${!filled.length?'disabled':''}>保存本页选择的记忆</button><span class="mini">未勾选的回答仍保留为本地草稿。</span></div>${filled.length?filled.map(q=>{const a=state.answers[q.id];return `<article class="review-card"><label class="review-title"><input type="checkbox" data-review="${q.id}" ${a.remember?'checked':''}><span>${esc(q.title)}</span></label><p class="muted">${esc(a.text)}</p><div class="split"><span class="mini">${state.memories.some(m=>m.questionId===q.id)?'已确认 · 可撤销':'本地草稿'}</span><button class="text-button" data-edit-answer="${q.id}">修改回答</button></div></article>`;}).join(''):'<div class="empty-state"><h2>从一道轻松的问题开始</h2><p>完成回答后，你可以在这里决定哪些值得留下。</p></div>'}</div>`;
  $('#back-review').onclick=()=>{reviewing=false;questionIndex=null;render();};
  $$('[data-edit-answer]').forEach(b=>b.onclick=()=>{reviewing=false;questionIndex=questions.findIndex(q=>q.id===b.dataset.editAnswer);render();});
  $('#confirm-answers').onclick=()=>safe(async()=>{
    const ids=[];
    for(const input of $$('[data-review]')){const qid=input.dataset.review,a=state.answers[qid];if(a.remember!==input.checked)state=await call('answer',qid,{...a,remember:input.checked});if(input.checked)ids.push(qid);}
    state=await call('confirm-answers',ids);toast('已保存你的选择。你随时可以修改或删除。');render();
  });
}
function renderMemories(){
  const memories=state.memories.filter(m=>m.status===memoryTab&&(!search||m.text.toLowerCase().includes(search.toLowerCase()))).slice().reverse();
  $('#main').innerHTML=topbar('关于我的记忆')+`<div class="content">${header('了解你，是一件慢慢的事。','这里的每一条记忆，都由你决定是否留下。','<button class="button secondary" id="add-memory">＋ 记住一件事</button>')}<div class="tabs"><button class="tab ${memoryTab==='confirmed'?'active':''}" data-tab="confirmed">已确认 · ${confirmed().length}</button><button class="tab ${memoryTab==='pending'?'active':''}" data-tab="pending">待确认 · ${state.memories.filter(m=>m.status==='pending').length}</button></div><input class="search-input" id="search-memories" aria-label="搜索记忆" placeholder="找一段经历、一个人，或一种偏好…" value="${esc(search)}">${memoryTab==='pending'?'<p class="muted">这是模型从聊天中整理的新理解，可能有误。确认前不会用于后续回复。</p>':''}<div id="memory-results">${memories.length?memories.map(memoryCard).join(''):`<div class="empty-state"><div class="welcome-mark"><img src="assets/whale/sleepy.png" alt="Q版鲸鱼娘"></div><h2>${search?'没有找到相关记忆':memoryTab==='pending'?'暂时没有需要确认的理解':'我们还有很多时间认识彼此'}</h2><p>${search?'换个词试试。':'可以填写问卷，也可以在聊天中慢慢留下你的故事。'}</p></div>`}</div><div class="notice">“已确认”表示你允许把这条自述用于聊天，不代表它永远不变。<br>删除记忆后，旧聊天和问卷草稿仍独立保留；需要时也可以单独删除。</div></div>`;
  $$('[data-tab]').forEach(b=>b.onclick=()=>{memoryTab=b.dataset.tab;renderMemories();});
  $('#search-memories').oninput=e=>{const position=e.target.selectionStart;search=e.target.value;renderMemories();$('#search-memories').focus();$('#search-memories').setSelectionRange(position,position);};
  $('#add-memory').onclick=()=>editMemory();
  $$('[data-edit-memory]').forEach(b=>b.onclick=()=>editMemory(state.memories.find(m=>m.id===b.dataset.editMemory)));
  $$('[data-confirm-memory]').forEach(b=>b.onclick=()=>safe(async()=>{const m=state.memories.find(m=>m.id===b.dataset.confirmMemory);state=await call('memory-save',m);toast('这条理解已确认。');render();}));
  $$('[data-delete-memory]').forEach(b=>b.onclick=()=>confirmDialog('让这条记忆离开？','删除后不再用于长期记忆。原始聊天或问卷回答仍单独保留。',async()=>{state=await call('memory-delete',b.dataset.deleteMemory);render();}));
}
function memoryCard(m){const category=sections.find(s=>s.id===m.category)?.title||'日常';return `<article class="memory-card"><div class="memory-meta"><span class="memory-tag">${esc(category)}</span><span>${esc(m.source)}</span><span>${new Date(m.updatedAt).toLocaleDateString('zh-CN')}</span></div><div class="memory-text">${esc(m.text)}</div><div class="memory-actions"><button data-delete-memory="${m.id}">${m.status==='pending'?'不留下':'删除'}</button><button data-edit-memory="${m.id}">修改${m.status==='pending'?'并确认':''}</button>${m.status==='pending'?`<button data-confirm-memory="${m.id}">确认记住 ✓</button>`:''}</div></article>`;}
function editMemory(m){memoryDraft=m;modal(`<h2>${m?'修改这条理解':'有件事，想让你记住'}</h2><p class="muted">用你自己的话描述，随时可以再改。</p><textarea id="memory-text" class="memory-edit" maxlength="4000" aria-label="记忆内容">${esc(m?.text||'')}</textarea><label class="field"><span class="field-label">放在哪一页</span><select id="memory-category">${sections.map(s=>`<option value="${s.id}" ${s.id===m?.category?'selected':''}>${esc(s.title)}</option>`).join('')}</select></label><div class="dialog-footer"><button class="button secondary" id="cancel-memory">取消</button><button class="button" id="save-memory">确认记住</button></div>`);$('#cancel-memory').onclick=closeModal;$('#save-memory').onclick=()=>safe(async()=>{state=await call('memory-save',{id:memoryDraft?.id,text:$('#memory-text').value,category:$('#memory-category').value});closeModal();render();toast('已记住。');});}
function renderSettings(){
  const s=state.settings;
  $('#main').innerHTML=topbar('连接与设置')+`<div class="content">${header('连接模型，保管好你的故事。','软件与记忆留在本地，模型能力通过你选择的 API 获得。')}<div class="settings-grid"><div><section class="panel"><h3>模型连接</h3><p>支持 OpenAI 兼容的 Chat Completions 接口。没有默认供应商，也没有内置代理。</p><form id="settings-form"><label class="field"><span class="field-label">API Base URL</span><input id="base-url" type="url" placeholder="https://你的服务商/v1" value="${esc(s.baseUrl)}" required><small>填写到 /v1（以服务商文档为准），不用填写 /chat/completions。更换地址时，原密钥会清除，需重新填写。</small></label><label class="field"><span class="field-label">模型名称</span><input id="model-name" placeholder="填写服务商提供的模型 ID" value="${esc(s.model)}" required></label><label class="field"><span class="field-label">API Key ${state.hasKey?'· 已加密保存':''}</span><input id="api-key" type="password" autocomplete="off" placeholder="${state.hasKey?'留空保留原密钥（地址不变时）':'输入你的 API 密钥'}"><small>使用操作系统能力加密保存，不会在页面中回显。</small></label><label class="check"><input type="checkbox" id="extract-memory" ${s.extractMemory?'checked':''}>后台批量整理记忆（额外 API 调用）</label><div class="actions" style="margin-top:25px"><button class="button" type="submit" id="save-settings">保存设置</button><button class="button secondary" type="button" id="test-api">测试已保存的连接</button></div><p class="mini" id="test-status" role="status" style="margin-top:15px;margin-bottom:0">测试会向 API 发送一句连接测试消息，不发送个人记忆。</p></form></section><section class="panel"><h3>本地数据</h3><p>问卷、聊天和记忆保存在这台设备。数据文件本身未另行加密，请结合系统账户权限与磁盘加密保护。</p><div class="data-path">${esc(state.dataPath)}</div><div class="actions" style="margin-top:20px"><button class="button secondary" id="export-data">导出备份</button><button class="text-button" id="open-data">打开数据文件夹</button></div><div class="actions" style="margin-top:20px"><button class="text-button" id="delete-key">移除 API 密钥</button><button class="text-button" id="reset-data">清空所有本地数据</button></div></section></div><aside class="settings-note"><h3>发送边界</h3>调用模型时，会发送当前消息、当前会话近期内容和部分已确认记忆。<br><br>问卷草稿和待确认记忆不会作为聊天记忆发送。<br><br>开启记忆整理时，空闲后会额外发送最多 5 轮已授权对话和已有记忆摘要。满 5 轮且空闲 15 秒，或不足 5 轮且空闲 2 分钟时整理。<hr><h3>iPhone 互通</h3>尚未开放。下一阶段需要配对和私人网络连接。<br><br>此版本没有云端同步，也没有远程监听服务。</aside></div></div>`;
  $('#settings-form').onsubmit=e=>{e.preventDefault();safe(async()=>{state=await call('settings-save',{baseUrl:$('#base-url').value,model:$('#model-name').value,key:$('#api-key').value,extractMemory:$('#extract-memory').checked});renderSettings();toast('连接设置已保存。');});};
  $('#test-api').onclick=()=>safe(async()=>{const b=$('#test-api');b.disabled=true;$('#test-status').textContent='正在测试已保存的连接…';try{await call('test-connection');$('#test-status').textContent='✓ 连接成功，可以开始聊天。';}catch(e){$('#test-status').textContent=e.message;}finally{b.disabled=false;}});
  $('#export-data').onclick=()=>safe(async()=>{if(await call('export'))toast('备份已导出。');});
  $('#open-data').onclick=()=>safe(()=>call('open-data'));
  $('#delete-key').onclick=()=>confirmDialog('移除保存的 API 密钥？','聊天与记忆会保留。重新填写密钥后可以继续聊天。',async()=>{state=await call('key-delete');render();});
  $('#reset-data').onclick=()=>safe(async()=>{if(await call('reset')){state=await call('state');currentId=null;questionIndex=null;reviewing=false;page='chat';render();toast('本地数据已清空。');}});
}
function modal(html){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();}
function confirmDialog(title,description,fn){modal(`<h2>${esc(title)}</h2><p class="muted">${esc(description)}</p><div class="dialog-footer"><button class="button secondary" id="cancel-dialog">取消</button><button class="button" id="confirm-dialog">确认</button></div>`);$('#cancel-dialog').onclick=closeModal;$('#confirm-dialog').onclick=()=>{closeModal();safe(fn);};}
$$('[data-page]').forEach(b=>b.onclick=()=>safe(async()=>{await pendingSave;page=b.dataset.page;render();}));
$('#new-conversation').onclick=()=>safe(async()=>{await pendingSave;currentId=await call('conversation-new');state=await call('state');page='chat';sendError='';render();});
api.onStream(data=>{
  const c=state.conversations.find(c=>c.id===data.cid);if(!c)return;
  let message=c.messages.find(m=>m.id===data.id);
  if(!message){message={id:data.id,role:'assistant',partial:true,createdAt:data.createdAt};c.messages.push(message);}
  message.content=data.content;
  if(page!=='chat'||currentId!==data.cid)return;
  const element=$(`[data-message="${data.id}"] .message-content`);
  if(!element){stage='正在回复…';renderChat();return;}
  const body=$('#chat-body'),follow=body.scrollHeight-body.scrollTop-body.clientHeight<100;
  element.textContent=data.content;
  if(follow)body.scrollTop=body.scrollHeight;
});
api.onState(data=>{state=data;updateSidebar();});
api.onStage(text=>{stage=text;if(page==='chat'&&generating)renderChat();});
call('state').then(data=>{state=data;render();if(state.recovered)toast('已从上一份本地备份恢复数据。损坏文件已保留，请导出备份。');}).catch(e=>{$('#main').innerHTML=`<div class="loading">${esc(e.message)}</div>`;});

$('#theme-credit').onclick=()=>{modal(`<h2>鲸鱼娘社区主题</h2><p class="muted">这是参考社区 Q 版 DeepSeek 鲸鱼娘制作的非官方主题。</p><div class="theme-source">角色原作：上善（上善无形）
女仆形象二次设计：ZipZipPipe
表情与图标素材：Small-tailqwq / dsh-deep-whale

美术：CC BY-NC-SA 4.0
来源：https://github.com/Small-tailqwq/dsh-deep-whale
许可：https://creativecommons.org/licenses/by-nc-sa/4.0/

角色图片保持原图；应用图标仅作缩放与底板适配。完整署名与许可随软件保存在 assets/whale 内。</div><div class="dialog-footer"><button class="button secondary" id="close-credit">知道啦</button></div>`);$('#close-credit').onclick=closeModal;};
