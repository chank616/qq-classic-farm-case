// Match this one requested SSO sequence only. Never export authentication bytes.
const __ssoDll=Process.getModuleByName('QQNT.dll');
const __ssoApi=(n,r,a)=>new NativeFunction(__ssoDll.getExportByName(n),r,a);
const __ssoText=__ssoApi('napi_get_value_string_utf8','int',['pointer','pointer','pointer','uint64','pointer']);
const __ssoType=__ssoApi('napi_typeof','int',['pointer','pointer','pointer']);
const __ssoGlobal=__ssoApi('napi_get_global','int',['pointer','pointer']);
const __ssoGet=__ssoApi('napi_get_named_property','int',['pointer','pointer','pointer','pointer']);
const __ssoSet=__ssoApi('napi_set_named_property','int',['pointer','pointer','pointer','pointer']);
const __ssoArray=__ssoApi('napi_create_array_with_length','int',['pointer','uint64','pointer']);
const __ssoElement=__ssoApi('napi_set_element','int',['pointer','pointer','uint','pointer']);
const __ssoName=Memory.allocUtf8String('__qqFarmMatchedSsoArguments');
const __ssoDispatchReceiver=Memory.allocUtf8String('__qqFarmDispatcherReceiver'),__ssoDispatchFunction=Memory.allocUtf8String('__qqFarmDispatcherFunction');
const __ssoDispatchSample=Memory.allocUtf8String('__qqFarmDispatcherSample');
let __ssoBusy=false,__ssoMatches=0;const __ssoCallbacks={};
const __ssoKey=Memory.allocUtf8String('name');
const __ssoRequestKeys=['requestId','request_id','seq','callbackId'].map(x=>Memory.allocUtf8String(x));
rpc.exports={ssostats(){return {matches:__ssoMatches,callbacks:__ssoCallbacks};}};
const __ssoListener=Interceptor.attach(__ssoDll.getExportByName('napi_call_function'),{
 onEnter(args){
  if(__ssoBusy||__ssoMatches>=5)return;const count=args[3].toInt32();if(count<1||count>12)return;
  __ssoBusy=true;
  try{
   const env=args[0],kind=Memory.alloc(4);
   const text=Memory.alloc(65536),len=Memory.alloc(8);
   const callbackName=Memory.alloc(8);if(__ssoGet(env,args[2],__ssoKey,callbackName)===0&&__ssoText(env,callbackName.readPointer(),text,65535,len)===0){const name=text.readUtf8String();if(Object.keys(__ssoCallbacks).length<30||name in __ssoCallbacks)__ssoCallbacks[name]=(__ssoCallbacks[name]||0)+1;if(name==='dispatchCall'){const g=Memory.alloc(8);if(__ssoGlobal(env,g)===0){__ssoSet(env,g.readPointer(),__ssoDispatchReceiver,args[1]);__ssoSet(env,g.readPointer(),__ssoDispatchFunction,args[2]);__ssoSet(env,g.readPointer(),__ssoDispatchSample,args[4].readPointer());}}}
   function matches(value){if(__ssoType(env,value,kind)!==0||kind.readInt()!==4)return false;if(__ssoText(env,value,text,65535,len)!==0)return false;const str=text.readUtf8String();return str==='__QQ_REQUEST_ID__'||str.includes('LightAppSvc.mini_program_auth.GetCode')||str.includes('"__QQ_REQUEST_ID__"');}
   let matched=false;
   for(let i=0;i<Math.min(count,5)&&!matched;i++){
    const value=args[4].add(i*8).readPointer();matched=matches(value);
    if(!matched&&__ssoType(env,value,kind)===0&&kind.readInt()===6){for(const key of __ssoRequestKeys){const field=Memory.alloc(8);if(__ssoGet(env,value,key,field)===0&&matches(field.readPointer())){matched=true;break;}}}
   }
   if(!matched)return;
   const global=Memory.alloc(8),array=Memory.alloc(8);
   if(__ssoGlobal(env,global)!==0||__ssoArray(env,count,array)!==0)return;
   for(let i=0;i<count;i++)__ssoElement(env,array.readPointer(),i,args[4].add(i*8).readPointer());
   __ssoSet(env,global.readPointer(),__ssoName,array.readPointer());__ssoMatches++;
  }finally{__ssoBusy=false;}
 }
});
