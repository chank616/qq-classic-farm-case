(()=>{try{
 const session=globalThis.__qqFarmExistingSession,misc=session.getNodeMiscService();
 globalThis.__qqFarmExistingMisc=misc;
 const methods=Object.getOwnPropertyNames(Object.getPrototypeOf(misc));
 return JSON.stringify({pid:process.pid,miscMethods:methods.filter(x=>/mini|code|sso|login|auth|web|cookie|token|request/i.test(x)),methodCount:methods.length});
}catch(e){return JSON.stringify({errorType:e.name,message:e.message.slice(0,180)});}})()
