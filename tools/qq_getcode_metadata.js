(async()=>{try{
 const misc=globalThis.__qqFarmExistingMisc;if(!misc)return JSON.stringify({state:'existing-api-unavailable'});
 const returned=misc.loginWithAppId('1112386029');
 const wasPromise=!!returned&&typeof returned.then==='function';
 const reply=await returned;
 globalThis.__qqFarmLastCodeReply=reply;
 const code=typeof reply==='string'?reply:reply?.code||(reply?.errCode===0&&typeof reply.result==='string'?reply.result:reply?.result?.code);
 if(typeof code!=='string'||!code)return JSON.stringify({state:'code-not-returned',wasPromise,replyType:typeof reply,keys:reply&&typeof reply==='object'?Object.keys(reply):[],errCode:reply?.errCode,resultType:typeof reply?.result,resultKeys:reply?.result&&typeof reply.result==='object'?Object.keys(reply.result):[]});
 globalThis.__qqFarmLoginCode={value:code,at:Date.now(),source:'existing-qq-loginWithAppId',pid:process.pid};
 return JSON.stringify({pid:process.pid,state:'login-code-acquired',codeLength:code.length,wasPromise,qqStarted:false,farmStarted:false});
}catch(e){return JSON.stringify({state:'code-request-failed',errorType:e.name,message:e.message.slice(0,180)});}})()
