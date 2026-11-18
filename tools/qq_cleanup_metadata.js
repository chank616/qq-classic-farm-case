(()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),wc=req('electron').webContents.fromId(2);
 const attached=wc.debugger.isAttached();
 if(attached)wc.debugger.detach();
 return JSON.stringify({pid:process.pid,ownDiagnosticDebuggerDetached:attached,debuggerAttached:wc.debugger.isAttached(),nativeExportsAvailable:!!globalThis.__qqFarmNativeExports});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
