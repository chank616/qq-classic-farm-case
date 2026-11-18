(()=>{try{
 const root=globalThis.__qqFarmDispatcherReceiver;
 const shape=obj=>({type:typeof obj,constructor:obj?.constructor?.name,keys:obj&&(typeof obj==='object'||typeof obj==='function')?Object.getOwnPropertyNames(obj).slice(0,80):[],prototypeNames:obj&&Object.getPrototypeOf(obj)?Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).slice(0,80):[]});
 const fields=root&&typeof root==='object'?Object.getOwnPropertyNames(root).slice(0,25).map(key=>{let value;try{value=root[key]}catch{};return {key,...shape(value)}}):[];
 const api=globalThis.__qqFarmNativeExports;
 const services={};for(const k of Object.keys(api||{}).filter(k=>/LoginService|ECDH|Engine|Startup|QQPlay|MiniApp|MSF/.test(k)))services[k]={staticNames:Object.getOwnPropertyNames(api[k]),prototypeNames:api[k]?.prototype?Object.getOwnPropertyNames(api[k].prototype):[]};
 const play=globalThis.__qqFarmExistingSession?.getQQPlayService();
 return JSON.stringify({pid:process.pid,receiver:shape(root),fields,services,play:shape(play),functionLengths:root?Object.fromEntries(Object.keys(root).map(k=>[k,root[k]?.length])):{}});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
