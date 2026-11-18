(async()=>{try{
 delete globalThis.__qqFarmDispatcherSample;
 await new Promise(resolve=>setTimeout(resolve,6000));
 const sample=globalThis.__qqFarmDispatcherSample;
 function schema(value,depth=0,key=''){
  if(value===null)return {type:'null'};
  if(typeof value==='string'){
   if(/^(method|methodName|funcName|cmd|cmdName|service|serviceName|type|module|moduleName)$/.test(key))return {type:'string',value:value.slice(0,180)};
   if(/^[\[{]/.test(value)){try{return {type:'json',schema:schema(JSON.parse(value),depth+1)};}catch{}}
   return {type:'string'};
  }
  if(typeof value!=='object')return {type:typeof value};
  if(ArrayBuffer.isView(value))return {type:'binary',bytes:value.byteLength};
  if(depth>3)return {type:'object',keys:Object.keys(value).slice(0,20)};
  if(Array.isArray(value))return {type:'array',items:value.slice(0,4).map(x=>schema(x,depth+1))};
  const r={};for(const k of Object.keys(value).slice(0,20))r[k]=schema(value[k],depth+1,k);return r;
 }
 const output=schema(sample);delete globalThis.__qqFarmDispatcherSample;
 return JSON.stringify({pid:process.pid,dispatchCallSchema:output});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
