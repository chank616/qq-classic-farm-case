(()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),mod=req('module'),cache=mod._cache;
 const keys=Object.keys(cache);
 const selected=keys.filter(x=>/wrapper\.node|major\.node|kernel|session|native|msf|miniapp|background/.test(x));
 return JSON.stringify({pid:process.pid,moduleCount:keys.length,mainFile:process.mainModule.filename,
 modules:selected.slice(0,70).map(x=>({file:x,exportNames:Object.keys(cache[x].exports||{}).slice(0,45)}))});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,160)});}})()
