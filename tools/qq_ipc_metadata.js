(()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),electron=req('electron');
 const ipc=electron.ipcMain;
 const channels=ipc.eventNames().map(x=>({name:String(x),listeners:ipc.listeners(x).map(f=>({name:f.name,length:f.length}))}));
 const invokes=ipc._invokeHandlers?Array.from(ipc._invokeHandlers.entries()).map(([name,f])=>({name,functionName:f.name,length:f.length})):[];
 return JSON.stringify({pid:process.pid,channels:channels.slice(0,70),invokes:invokes.slice(0,70),moduleLoads:process.moduleLoadList.filter(x=>/qq|wrap|kernel/i.test(x))});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
