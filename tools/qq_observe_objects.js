// Observe existing QQ API objects. Never create or initialize a QQ session.
'use strict';
const dll=Process.getModuleByName('QQNT.dll');
const api=(n,r,a)=>new NativeFunction(dll.getExportByName(n),r,a);
const getGlobal=api('napi_get_global','int',['pointer','pointer']);
const getNamed=api('napi_get_named_property','int',['pointer','pointer','pointer','pointer']);
const setNamed=api('napi_set_named_property','int',['pointer','pointer','pointer','pointer']);
const readText=api('napi_get_value_string_utf8','int',['pointer','pointer','pointer','uint64','pointer']);
const clear=api('napi_get_and_clear_last_exception','int',['pointer','pointer']);
const constructorKey=Memory.allocUtf8String('constructor'),nameKey=Memory.allocUtf8String('name'),sessionKey=Memory.allocUtf8String('__qqFarmExistingSession');
let busy=false,finished=false,calls=0,hasThis=0,listener;
const names={};
const stop=(state,extra={})=>{if(finished)return;finished=true;clearTimeout(timer);listener.detach();send({state,pid:Process.id,calls,hasThis,names,...extra});};
const timer=setTimeout(()=>stop('observation-finished'),20000);
listener=Interceptor.attach(dll.getExportByName('napi_get_cb_info'),{
 onEnter(args){this.env=args[0];this.self=args[4];},
 onLeave(ret){
  if(finished||busy||ret.toInt32()!==0)return;calls++;
  if(this.self.isNull())return;
  busy=true;
  try{
   const value=this.self.readPointer();if(value.isNull())return;hasThis++;
   const ctor=Memory.alloc(8),name=Memory.alloc(8),out=Memory.alloc(256),size=Memory.alloc(8);
   let status=getNamed(this.env,value,constructorKey,ctor);
   if(status===0)status=getNamed(this.env,ctor.readPointer(),nameKey,name);
   if(status===0)status=readText(this.env,name.readPointer(),out,255,size);
   if(status!==0){clear(this.env,name);return;}
   const type=out.readUtf8String();names[type]=(names[type]||0)+1;
   if(type==='NodeIQQNTWrapperSession'){
    const global=Memory.alloc(8);let saved=getGlobal(this.env,global);
    if(saved===0)saved=setNamed(this.env,global.readPointer(),sessionKey,value);
    stop(saved===0?'existing-session-found':'session-reference-failed',{saved});
   }
  }catch(e){stop('observation-error',{errorType:e.name,description:e.message});}
  finally{busy=false;}
 }
});
