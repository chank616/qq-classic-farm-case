(()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),path=req('path');
 const root=path.dirname(path.dirname(path.dirname(process.mainModule.filename)));
 if(!globalThis.__qqFarmNativeExports){const m={exports:{}};process.dlopen(m,path.join(root,'wrapper.node'));globalThis.__qqFarmNativeExports=m.exports;}
 const exports=globalThis.__qqFarmNativeExports;
 const ctor=exports.NodeIQQNTWrapperSession;
 return JSON.stringify({pid:process.pid,exportNames:Object.keys(exports).filter(x=>/Session|Util|MSF|MiniApp/.test(x)),
 sessionStaticNames:ctor?Object.getOwnPropertyNames(ctor):[],
 sessionPrototypeNames:ctor&&ctor.prototype?Object.getOwnPropertyNames(ctor.prototype):[]});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,200)});}})()
