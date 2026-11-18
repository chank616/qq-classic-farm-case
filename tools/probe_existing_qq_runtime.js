// One metadata expression on QQ's own JS callback thread. No account values.
'use strict';
const dll=Process.getModuleByName('QQNT.dll');
const fn=(name,result,args)=>new NativeFunction(dll.getExportByName(name),result,args);
const makeString=fn('napi_create_string_utf8','int',['pointer','pointer','uint64','pointer']);
const runScript=fn('napi_run_script','int',['pointer','pointer','pointer']);
const readString=fn('napi_get_value_string_utf8','int',['pointer','pointer','pointer','uint64','pointer']);
const clearException=fn('napi_get_and_clear_last_exception','int',['pointer','pointer']);
const expression=__QQ_PROBE_EXPRESSION__;
// Native QQ callbacks may hold internal locks. Run work later on the normal JS
// event loop, then read only its serialized diagnostic result on a later callback.
const resultFile=__QQ_RESULT_FILE__;
const scheduled=`(()=>{setImmediate(async()=>{let result;try{result=await Promise.race([(0,eval)(${JSON.stringify(expression)}),new Promise(resolve=>setTimeout(()=>resolve(JSON.stringify({state:'diagnostic-timeout'})),14000))]);}catch(e){result=JSON.stringify({errorType:e.name,message:String(e.message).slice(0,180)});}process.mainModule.require('fs').writeFileSync(${JSON.stringify(resultFile)},result);});return 'scheduled';})()`;
const sources=[Memory.allocUtf8String(scheduled)];
let completed=false,busy=false,listener,stage=0;
const timer=setTimeout(()=>{if(!completed){completed=true;listener.detach();send({state:'no-runtime-callback',pid:Process.id,stage});}},35000);
listener=Interceptor.attach(dll.getExportByName('napi_get_cb_info'),{
 onEnter(args){this.env=args[0];},
 onLeave(){
  if(completed||busy)return;busy=true;let waiting=false;
  try{
   const code=Memory.alloc(8),value=Memory.alloc(8),length=Memory.alloc(8);
   let status=makeString(this.env,sources[stage],uint64('18446744073709551615'),code);
   if(status===0)status=runScript(this.env,code.readPointer(),value);
   if(status!==0){clearException(this.env,value);send({state:'runtime-api-rejected',status,pid:Process.id});}
   else{
    let s=readString(this.env,value.readPointer(),ptr(0),0,length);
    if(s!==0)send({state:'runtime-result-not-string',status:s,pid:Process.id});
    else{const n=Number(length.readU64());if(n>32768)throw Error('Metadata result too large');const out=Memory.alloc(n+1);s=readString(this.env,value.readPointer(),out,n+1,length);const result=out.readUtf8String();send({state:result==='scheduled'?'scheduled':'runtime-result',pid:Process.id});}
   }
  }catch(e){send({state:'runtime-probe-error',description:e.message,pid:Process.id});}
  finally{if(!waiting){completed=true;clearTimeout(timer);listener.detach();}busy=false;}
 }
});
