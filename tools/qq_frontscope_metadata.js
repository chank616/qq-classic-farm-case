(async()=>{let debug,attached=false,timeout;try{
 const req=process.mainModule.require.bind(process.mainModule),wc=req('electron').webContents.fromId(2);
 debug=wc.debugger;if(debug.isAttached())return JSON.stringify({state:'existing-debugger-not-touched'});
 debug.attach('1.3');attached=true;timeout=setTimeout(()=>{if(attached){debug.detach();attached=false;}},8000);
 const post=(method,args={})=>Promise.race([debug.sendCommand(method,args),new Promise((resolve,reject)=>setTimeout(()=>reject(Error('Debug command timed out: '+method)),2500))]);
 const target=(await post('Runtime.evaluate',{expression:'window.__qqFarmFrontendRequire',objectGroup:'qq-farm-diagnostic'})).result;
 const properties=await post('Runtime.getProperties',{objectId:target.objectId,ownProperties:true});
 const scopes=properties.internalProperties?.find(x=>x.name==='[[Scopes]]')?.value;
 if(!scopes)return JSON.stringify({pid:process.pid,hasScopes:false});
 const list=(await post('Runtime.getProperties',{objectId:scopes.objectId,ownProperties:true})).result;
 const records=[];let cacheFound=false;
 for(const scope of list.filter(x=>/^\d+$/.test(x.name)).slice(0,4)){
  const values=(await post('Runtime.getProperties',{objectId:scope.value.objectId,ownProperties:true})).result;
  records.push({scope:scope.name,description:scope.value.description,properties:values.slice(0,70).map(x=>({name:x.name,type:x.value?.type,className:x.value?.className}))});
  for(const value of values.filter(x=>x.value?.className==='Object'&&x.value?.objectId)){
   const check=await post('Runtime.callFunctionOn',{objectId:value.value.objectId,functionDeclaration:`function(){const keys=Object.keys(this),sample=keys.slice(0,3);const match=keys.length>30&&sample.every(k=>/^\\d+$/.test(k)&&this[k]&&typeof this[k]==='object'&&Object.prototype.hasOwnProperty.call(this[k],'exports'));if(match)window.__qqFarmFrontendCache=this;return {keys:keys.length,cache:match};}`,returnByValue:true});
   if(check.result?.value?.cache){cacheFound=true;records.push({cacheVariable:value.name,...check.result.value});}
  }
 }
 await post('Runtime.releaseObjectGroup',{objectGroup:'qq-farm-diagnostic'});
 return JSON.stringify({pid:process.pid,hasScopes:true,cacheFound,records});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,200)});}
finally{clearTimeout(timeout);if(attached)debug.detach();}})()
