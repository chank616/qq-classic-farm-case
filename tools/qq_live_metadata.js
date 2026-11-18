(async()=>{try{
 const req=process.mainModule.require.bind(process.mainModule),net=req('net'),crypto=req('crypto'),Buffer=req('buffer').Buffer;
 const misc=globalThis.__qqFarmExistingMisc;if(!misc)return JSON.stringify({state:'existing-session-unavailable'});
 if(globalThis.__qqFarmCodePipe)globalThis.__qqFarmCodePipe.close();
 const token=Buffer.from('__PIPE_AUTH_TOKEN__');
 const server=net.createServer(socket=>{
  let buffer='',handled=false;socket.setEncoding('utf8');socket.setTimeout(15000,()=>socket.destroy());
  socket.on('error',()=>{});
  socket.on('data',async text=>{
   if(handled)return;buffer+=text;if(buffer.length>4096){socket.destroy();return;}if(!buffer.includes('\n'))return;handled=true;
   try{
    const message=JSON.parse(buffer.split('\n')[0]),input=Buffer.from(String(message.token||''));
    if(input.length!==token.length||!crypto.timingSafeEqual(input,token)){socket.end('{"error":"unauthorized"}\n');return;}
    const result=await misc.loginWithAppId('1112386029');
    const code=result?.errCode===0?(typeof result.result==='string'?result.result:result.result?.code):null;
    if(!code){socket.end('{"error":"QQ code request failed"}\n');return;}
    socket.end(JSON.stringify({code,at:Date.now(),source:'existing-qq-session',qqPid:process.pid})+'\n');
   }catch{socket.end('{"error":"QQ session request failed"}\n');}
  });
 });
 server.maxConnections=2;globalThis.__qqFarmCodePipe=server;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen('\\\\.\\pipe\\__PIPE_NAME__',resolve);});
 const timer=setTimeout(()=>{server.close();if(globalThis.__qqFarmCodePipe===server)delete globalThis.__qqFarmCodePipe;},180000);timer.unref();server.unref();
 return JSON.stringify({state:'auth-pipe-ready',pid:process.pid,qqStarted:false,farmStarted:false});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
