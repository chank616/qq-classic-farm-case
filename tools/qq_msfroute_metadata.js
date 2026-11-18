(async()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),electron=req('electron');
 const wc=electron.webContents.fromId(2);
 const result=await Promise.race([
  wc.executeJavaScript(`(async()=>{try{const value=await window.ipcRenderer.invoke('ntApi',{cmdName:'nodeIKernelMSFService/getMsfStatus',cmdType:'invoke',payload:[]});return {state:'reply',valueType:typeof value,keys:value&&typeof value==='object'?Object.keys(value):[],numericValue:typeof value==='number'?value:undefined};}catch(e){return {state:'rejected',errorType:e.name,message:e.message.slice(0,180)}}})()`),
  new Promise(resolve=>setTimeout(()=>resolve({state:'timeout'}),5000))
 ]);
 return JSON.stringify({pid:process.pid,transport:'existing-renderer-invoke',result});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
