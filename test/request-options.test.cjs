const {test}=require('node:test');
const assert=require('node:assert/strict');
const {completionBody}=require('../src/request-options.cjs');
test('quick replies disable DeepSeek thinking by default for existing and new settings',()=>{
 for(const settings of [{model:'deepseek-v4.1-flash'},{model:'deepseek-flash',fastReply:true}])assert.deepEqual(completionBody(settings,[],{stream:true}).thinking,{type:'disabled'});
});
test('explicit opt-out restores provider defaults; other providers receive no vendor parameters',()=>{
 for(const settings of [{model:'deepseek-flash',fastReply:false},{model:'another-model',fastReply:true}])assert(!('thinking' in completionBody(settings,[])));
 const body=completionBody({model:'deepseek-flash'},[],{json:true});assert.equal(body.stream,false);assert.equal(body.temperature,0.1);assert(!body.stream_options);
});
test('deep thinking can be explicitly enabled without conflicting fast flags',()=>{
 assert.deepEqual(completionBody({model:'deepseek-v4.1-flash',deepThinking:true,fastReply:true},[]).thinking,{type:'enabled'});
 assert(!completionBody({model:'another-model',deepThinking:true},[]).thinking);
});
