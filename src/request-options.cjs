function completionBody(settings,messages,{json=false,stream=false}={}){
  return {model:settings.model,messages,stream,
    ...(stream?{stream_options:{include_usage:true}}:{}),
    ...(json?{temperature:0.1}:{}),
    ...(/deepseek/i.test(settings.model)&&(settings.deepThinking===true||settings.fastReply!==false)?{thinking:{type:settings.deepThinking===true?'enabled':'disabled'}}:{})};
}
module.exports={completionBody};
