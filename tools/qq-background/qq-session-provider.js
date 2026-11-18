(function(){
'use strict';
setImmediate(async function(){
 try {
  const req=process.mainModule.require.bind(process.mainModule),path=req('path'),net=req('net'),crypto=req('crypto'),Buffer=req('buffer').Buffer;
  const root=path.dirname(path.dirname(path.dirname(process.mainModule.filename)));
  const module={exports:{}};process.dlopen(module,path.join(root,'wrapper.node'));const api=module.exports;
  const session=api.NodeIQQNTWrapperSession.getNTWrapperSession('nt_1');
  if(!session||session.getMSFService().getMsfStatus()!==1)throw Error('QQ session offline');
  const misc=session.getNodeMiscService(),token=Buffer.from(__PIPE_TOKEN__);
  if(globalThis.__qqFarmBackgroundProvider)globalThis.__qqFarmBackgroundProvider.close();
  const server=net.createServer(socket=>{
   let buffer='',queue=Promise.resolve(),authenticated=false;
   socket.setEncoding('utf8');socket.setTimeout(10000,()=>socket.destroy());socket.on('error',()=>{});
   socket.on('close',()=>{server.close();if(globalThis.__qqFarmBackgroundProvider===server)delete globalThis.__qqFarmBackgroundProvider;});
   socket.on('data',text=>{
    buffer+=text;if(buffer.length>8192){socket.destroy();return;}
    while(buffer.includes('\n')){
     const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);
     queue=queue.then(async()=>{
      try{
       const message=JSON.parse(line),provided=Buffer.from(String(message.token||''));
       if(provided.length!==token.length||!crypto.timingSafeEqual(provided,token)){socket.destroy();return;}
       authenticated=true;socket.setTimeout(0);
       if(message.op==='hello'){socket.write(JSON.stringify({ready:true,qqPid:process.pid,sessionId:session.getSessionId()})+'\n');return;}
       if(message.op!=='get-code'){socket.write('{"error":"Unsupported operation"}\n');return;}
       if(session.getMSFService().getMsfStatus()!==1){socket.write('{"error":"QQ session offline"}\n');return;}
       const reply=await misc.loginWithAppId('1112386029');
       const code=reply?.errCode===0?(typeof reply.result==='string'?reply.result:reply.result?.code):null;
       if(typeof code!=='string'||code.length<16){socket.write('{"error":"QQ code request failed"}\n');return;}
       socket.write(JSON.stringify({code,at:Date.now(),qqPid:process.pid})+'\n');
      }catch{if(!socket.destroyed)socket.write('{"error":"QQ session request failed"}\n');}
     });
    }
   });
  });
  server.maxConnections=1;server.on('error',()=>{});globalThis.__qqFarmBackgroundProvider=server;
  server.listen('\\\\.\\pipe\\'+__PIPE_NAME__);server.unref();
  const timeout=setTimeout(()=>{if(server.listening&&server.getConnections)server.getConnections((error,count)=>{if(!count)server.close();});},60000);timeout.unref();
 }catch(error){globalThis.__qqFarmBackgroundProviderError=String(error?.name||'Error');}
});
})();
