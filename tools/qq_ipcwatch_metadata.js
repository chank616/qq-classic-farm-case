(async()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),ipc=req('electron').ipcMain;
 const channels=ipc.eventNames().filter(x=>/^RM_IPCFROM_RENDERER/.test(String(x))),records=[],listeners=[];
 function shape(value,depth=0,key=''){
  if(value===null)return {type:'null'};
  if(typeof value!=='object'){
   if(typeof value==='string'&&/^(eventName|cmd|cmdName|cmdType|command|method|methodName|channel|api|interfaceName|proxyName|type)$/.test(key))return {type:'string',value:value.slice(0,140)};
   if(typeof value==='string'&&/^[\[{]/.test(value)){try{return {type:'json-string',content:shape(JSON.parse(value),depth+1)};}catch{}}
   return {type:typeof value};
  }
  if(Buffer.isBuffer(value)||ArrayBuffer.isView(value))return {type:'binary',bytes:value.byteLength};
  if(depth>4)return {type:Array.isArray(value)?'array':'object',keys:Object.keys(value).slice(0,18)};
  if(Array.isArray(value))return {type:'array',length:value.length,items:value.slice(0,6).map(x=>shape(x,depth+1))};
  const result={};for(const k of Object.keys(value).slice(0,25))result[k]=shape(value[k],depth+1,k);return result;
 }
 for(const channel of channels){const f=(event,...args)=>{if(records.length<10)records.push({channel:String(channel),senderId:event?.sender?.id,args:shape(args)});};ipc.on(channel,f);listeners.push([channel,f]);}
 await new Promise(resolve=>setTimeout(resolve,6000));
 for(const [channel,f] of listeners)ipc.removeListener(channel,f);
 return JSON.stringify({pid:process.pid,channels:channels.length,records});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
