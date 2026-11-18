const fs=require('fs'),vm=require('vm');
const p='C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const s=fs.readFileSync(p,'utf8');
const decStart=s.indexOf('globalThis._Аce_7716=function(){');
const decEnd=s.indexOf('}();var',decStart)+3;
const modStart=s.indexOf('define("assets/main/index.4fbdd.js"');
const bodyStart=s.indexOf('{',modStart);
const modEnd=s.indexOf('\n});\ndefine(',bodyStart);
const ctx={console,Function,Date,JSON,Array,Object,String,Number,Boolean,RegExp,Math,Uint8Array,Int8Array,decodeURIComponent,encodeURIComponent,parseInt,parseFloat,globalThis:null};
ctx.globalThis=ctx;
const any=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:any(),apply:()=>any(),construct:()=>any()});
ctx.window=any();ctx.document=any();ctx.canvas=any();ctx.cc=any();ctx.qq=any();ctx.wx={};
for(const k of ['getSystemInfoSync','getWindowInfo','request','login','getStorageSync','setStorageSync','removeStorageSync','connectSocket','loadSubpackage'])ctx.wx[k]=(...a)=>any();
ctx._systems=[];
globalThis.__systems=ctx._systems;
ctx.System=new Proxy({}, {get:(t,k)=> (...args)=>{
  const rec={key:String(k),args,exports:{}};ctx._systems.push(rec);
  if(typeof args[2]==='function')try{
    const ex=(name,val)=>{if(typeof name==='string')rec.exports[name]=val;else if(name&&typeof name==='object')Object.assign(rec.exports,name);return any();};
    rec.reg=args[2](ex);
  }catch(e){rec.regError=String(e)}
  return any();
}});
ctx.require=(id)=>{if(id.includes('interopRequireDefault'))return x=>({default:x});if(id.includes('regenerator'))return {mark:(fn)=>fn,wrap:(fn)=>fn};if(id.includes('typeof'))return x=>typeof x;return any();};
vm.createContext(ctx);vm.runInContext(s.slice(decStart,decEnd)+';',ctx);
const factory=vm.runInContext('(function(require,module,exports){'+s.slice(bodyStart+1,modEnd)+'\n})',ctx);
factory(ctx.require,{exports:{}},{});
console.log('systems',ctx._systems.length);
const wantedList=['chunks:///_virtual/ServiceMethodName.ts','chunks:///_virtual/UserCryptoManager.ts','chunks:///_virtual/WxPlatformUtil.ts','chunks:///_virtual/TaskManager.ts','chunks:///_virtual/MainMgr.ts','chunks:///_virtual/milo.ts','chunks:///_virtual/plantpb.ts','chunks:///_virtual/userpb.ts','chunks:///_virtual/taskpb.ts','chunks:///_virtual/shoppb.ts','chunks:///_virtual/mallpb.ts','chunks:///_virtual/qqvippb.ts'];
const result={};
for(const wanted of wantedList){const rec=ctx._systems.find(x=>x.args[0]===wanted);if(!rec||!rec.reg)continue;try{for(const setter of rec.reg.setters||[])if(typeof setter==='function')setter(any());rec.reg.execute();result[wanted]=rec.exports;}catch(e){result[wanted]={error:String(e),stack:e.stack};}}
for(const rec of ctx._systems.filter(x=>/minimal|shared_root/.test(String(x.args[0])))){ console.log('REC',rec.args[0],rec.args[1],Object.keys(rec.exports||{}),rec.regError||''); }
