(async()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),electron=req('electron'),fs=req('fs');
 const contents=electron.webContents.fromId(2);
 const result=await contents.executeJavaScript(`(()=>{
  if(!window.__qqFarmFrontendRequire)window.webpackChunkqq_chat.push([['qq-farm-background-probe'],{},r=>{window.__qqFarmFrontendRequire=r;}]);
  const r=window.__qqFarmFrontendRequire,found=[];
  for(const [id,f] of Object.entries(r.m||{})){
   const text=String(f);
   if(/kernel|ntapi|sendmsf|mini_program_auth|wrapperSession|msfService/i.test(text))found.push({id,source:text,exportNames:r.c&&r.c[id]?Object.keys(r.c[id].exports||{}):null});
  }
  return {requireProperties:Object.getOwnPropertyNames(r),moduleCount:Object.keys(r.m||{}).length,samples:Object.entries(r.m||{}).slice(0,5).map(([id,f])=>({id,text:String(f).slice(0,180)})),cachedModules:r.c?Object.keys(r.c).length:null,modules:found};
 })()`);
 const dir='E:/workspace/QQ经典农场案例/artifacts/existing-qq-code';fs.mkdirSync(dir,{recursive:true});
 for(const m of result.modules){fs.writeFileSync(dir+'/frontend-'+m.id+'.js',m.source);m.sourceLength=m.source.length;delete m.source;}
 return JSON.stringify({pid:process.pid,...result});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
