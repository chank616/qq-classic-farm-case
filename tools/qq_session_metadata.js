(()=>{try{
 const api=globalThis.__qqFarmNativeExports;if(!api)return JSON.stringify({state:'native-api-unavailable'});
 // This identifier is used by QQ's own cached main bundle. Retrieve its existing
 // wrapper; never call init(), create(), online(), login(), or updateTicket().
 const session=api.NodeIQQNTWrapperSession.getNTWrapperSession('nt_1');
 if(!session)return JSON.stringify({state:'existing-session-unavailable'});
 globalThis.__qqFarmExistingSession=session;
 const msf=session.getMSFService(),mini=session.getMiniAppService();
 globalThis.__qqFarmExistingMsf=msf;
 const methods=obj=>obj?Object.getOwnPropertyNames(Object.getPrototypeOf(obj)):[];
 return JSON.stringify({pid:process.pid,state:'existing-session-retrieved',sessionId:session.getSessionId(),msfStatus:msf.getMsfStatus(),serverTime:msf.getServerTime(),msfMethods:methods(msf),miniMethods:methods(mini)});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,200)});}})()
