(()=>{try{
 const p=typeof process==='object'?process:null,m=p&&p.mainModule;
 return JSON.stringify({pid:p&&p.pid,requireType:typeof require,hasMainModule:!!m,
 hasBuiltinModule:typeof(p&&p.getBuiltinModule)==='function',
 globalNames:Object.getOwnPropertyNames(globalThis).filter(x=>/kernel|qq|session|ntApi|require|process/i.test(x))});
}catch(e){return JSON.stringify({errorType:e.name});}})()
