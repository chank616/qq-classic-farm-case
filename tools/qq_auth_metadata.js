(async()=>{try{
 const msf=globalThis.__qqFarmExistingMsf;if(!msf)return JSON.stringify({state:'existing-msf-unavailable'});
 const req=process.mainModule.require.bind(process.mainModule),Buffer=req('buffer').Buffer;
 const app=Buffer.from('1112386029'),body=Buffer.concat([Buffer.from([10,app.length]),app]);
 const wrapped=Buffer.concat([Buffer.from([34,body.length]),body]);
 const options={sendTimeout:10000,sendTimeoutOnSlowNet:10000,resendNum:0,sendOptions:0,reqTargetAccountType:0,account:'',accountType:0,transInfoMap:new Map()};
 delete globalThis.__qqFarmMatchedSsoArguments;
 const returned=msf.sendMsfRequest('__QQ_REQUEST_ID__','LightAppSvc.mini_program_auth.GetCode',wrapped,options);
 const wasPromise=!!returned&&typeof returned.then==='function';
 let reply=await returned;
 if(reply===undefined){
  const until=Date.now()+10000;
  while(Date.now()<until&&!globalThis.__qqFarmMatchedSsoArguments)await new Promise(resolve=>setTimeout(resolve,100));
  const matched=globalThis.__qqFarmMatchedSsoArguments;
  if(matched){globalThis.__qqFarmLastSsoReply=matched;return JSON.stringify({state:'sso-callback-matched',wasPromise,argumentTypes:matched.map(x=>({type:typeof x,isBuffer:Buffer.isBuffer(x)||ArrayBuffer.isView(x),keys:x&&typeof x==='object'?Object.keys(x).slice(0,15):[]}))});}
 }
 let bytes=Buffer.isBuffer(reply)||ArrayBuffer.isView(reply)?Buffer.from(reply):null;
 if(!bytes&&reply&&typeof reply==='object')for(const k of ['rspBuf','rspData','data','body','buffer'])if(Buffer.isBuffer(reply[k])||ArrayBuffer.isView(reply[k])){bytes=Buffer.from(reply[k]);break;}
 if(!bytes){globalThis.__qqFarmLastSsoReply=reply;return JSON.stringify({state:'sso-reply-shape',wasPromise,replyType:typeof reply,keys:reply&&typeof reply==='object'?Object.keys(reply):[]});}
 function parse(input){let at=0;const fields=new Map();function number(){let n=0n,shift=0n,b;do{if(at>=input.length||shift>63n)throw Error('Malformed SSO protobuf');b=input[at++];n|=BigInt(b&127)<<shift;shift+=7n;}while(b&128);return n;}
  while(at<input.length){const tag=Number(number()),field=tag>>>3,wire=tag&7;let value;if(wire===0)value=number();else if(wire===2){const n=Number(number());if(n>input.length-at)throw Error('Malformed SSO length');value=input.subarray(at,at+n);at+=n;}else if(wire===1){at+=8;continue;}else if(wire===5){at+=4;continue;}else throw Error('Unsupported SSO wire');fields.set(field,value);}return fields;
 }
 const outer=parse(bytes),ret=outer.get(2)??0n;
 if(ret!==0n)return JSON.stringify({state:'sso-rejected',retCode:ret.toString(),responseBytes:bytes.length});
 const busi=outer.get(4);if(!Buffer.isBuffer(busi))return JSON.stringify({state:'missing-sso-body',fields:[...outer.keys()],responseBytes:bytes.length});
 const auth=parse(busi),code=auth.get(2);
 if(!Buffer.isBuffer(code)||code.length===0)return JSON.stringify({state:'login-code-missing',fields:[...auth.keys()],responseBytes:bytes.length});
 globalThis.__qqFarmLoginCode={value:code.toString('utf8'),at:Date.now(),source:'existing-qq-msf',pid:process.pid};
 return JSON.stringify({pid:process.pid,state:'login-code-acquired',codeLength:code.length,qqStarted:false,farmStarted:false});
}catch(e){return JSON.stringify({state:'sso-error',errorType:e.name,message:e.message.slice(0,180)});}})()
