(()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),fs=req('fs'),path=req('path'),mod=req('module');
 const root=path.dirname(path.dirname(process.mainModule.filename));
 const out='E:/workspace/QQ经典农场案例/artifacts/existing-qq-code';fs.mkdirSync(out,{recursive:true});
 const files=[];
 for(const name of ['background.js','app_launcher/index.js','node-plugin.background.js']){
  const value=fs.readFileSync(path.join(root,name));
  fs.writeFileSync(path.join(out,name.replaceAll('/','_')),value);
  files.push({name,bytes:value.length});
 }
 const factories=[];
 for(const [file,m] of Object.entries(mod._cache)){
  if(!m.exports||!m.exports.modules)continue;
  for(const [id,factory] of Object.entries(m.exports.modules)){
   const text=String(factory);
   factories.push({chunk:path.basename(file),id,length:text.length,related:/kernel|session|miniapp|msf|SSO|Wrapper/.test(text)});
   if(/kernel|session|miniapp|msf|SSO|Wrapper/.test(text))fs.writeFileSync(path.join(out,'factory-'+id+'.js'),text);
  }
 }
 return JSON.stringify({pid:process.pid,files,factoryCount:factories.length,factories:factories.filter(x=>x.related).slice(0,60),sample:factories.slice(0,8),globals:Object.getOwnPropertyNames(globalThis).filter(x=>/webpack|kernel|session|qq|native/i.test(x))});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,160)});}})()
