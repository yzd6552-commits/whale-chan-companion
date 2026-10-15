function completionBody(settings,messages,{json=false,stream=false}={}){
  return {model:settings.model,messages,stream,
    ...(stream?{stream_options:{include_usage:true}}:{}),
    ...(json?{temperature:0.1}:{}),
    ...(settings.fastReply!==false && /deepseek/i.test(settings.model)?{thinking:{type:'disabled'}}:{})};
}
module.exports={completionBody};
