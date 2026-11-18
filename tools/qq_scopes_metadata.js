(async()=>{let session;try{
 const req=process.mainModule.require.bind(process.mainModule),inspector=req('inspector'),ipc=req('electron').ipcMain;
 session=new inspector.Session();session.connect();
 const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
 globalThis.__qqFarmScopeTarget=ipc.listeners('RM_IPCFROM_RENDERER2')[0];
 const target=(await post('Runtime.evaluate',{expression:'globalThis.__qqFarmScopeTarget',objectGroup:'qq-farm-diagnostic'})).result;
 const properties=await post('Runtime.getProperties',{objectId:target.objectId,ownProperties:true});
 const scopes=properties.internalProperties?.find(x=>x.name==='[[Scopes]]')?.value;
 if(!scopes)return JSON.stringify({pid:process.pid,hasScopes:false});
 const list=(await post('Runtime.getProperties',{objectId:scopes.objectId,ownProperties:true})).result;
 const records=[];
 for(const scope of list.filter(x=>/^\d+$/.test(x.name)).slice(0,5)){
  const values=(await post('Runtime.getProperties',{objectId:scope.value.objectId,ownProperties:true})).result;
  records.push({scope:scope.name,description:scope.value.description,properties:values.slice(0,100).map(x=>({name:x.name,type:x.value?.type,className:x.value?.className}))});
 }
 await post('Runtime.releaseObjectGroup',{objectGroup:'qq-farm-diagnostic'});
 return JSON.stringify({pid:process.pid,hasScopes:true,records});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,200)});}
finally{if(session)session.disconnect();delete globalThis.__qqFarmScopeTarget;}})()
