(async()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),electron=req('electron'),records=[];
 for(const contents of electron.webContents.getAllWebContents().filter(x=>[2,3].includes(x.id))){
  const globals=await contents.executeJavaScript(`(()=>{const names=Object.getOwnPropertyNames(window).filter(x=>/ipc|qq|native|ntapi|bridge|webpack|^app$|^api$/i.test(x));return names.map(name=>{let value;try{value=window[name]}catch{};return {name,type:typeof value,keys:value&&(typeof value==='object'||typeof value==='function')?Object.keys(value).slice(0,35):[]}});})()`);
  records.push({id:contents.id,type:contents.getType(),globals});
 }
 return JSON.stringify({pid:process.pid,records});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
