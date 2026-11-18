const fs=require('fs'),vm=require('vm');
const p='C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const s=fs.readFileSync(p,'utf8');
const ds=s.indexOf('globalThis._Аce_7716=function(){'),de=s.indexOf('}();var',ds)+3,ms=s.indexOf('define("assets/main/index.4fbdd.js"'),bs=s.indexOf('{',ms),me=s.indexOf('\n});\ndefine(',bs);
const ctx={console,Function,Date,JSON,Array,Object,String,Number,Boolean,RegExp,Math,Uint8Array,Int8Array,decodeURIComponent,encodeURIComponent,parseInt,parseFloat,globalThis:null};ctx.globalThis=ctx;
const any=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:any(),apply:()=>any(),construct:()=>any()});
ctx.window=any();ctx.document=any();ctx.canvas=any();ctx.cc=any();ctx.qq={};ctx.wx={};ctx._systems=[];
ctx.System=new Proxy({}, {get:(t,k)=>(...args)=>{const rec={key:String(k),args,exports:{}};ctx._systems.push(rec);if(typeof args[2]==='function')try{const ex=(name,val)=>{if(typeof name==='string')rec.exports[name]=val;else if(name&&typeof name==='object')Object.assign(rec.exports,name);return any()};rec.reg=args[2](ex)}catch(e){rec.regError=String(e)}return any()}});
ctx.require=(id)=>{if(id.includes('interopRequireDefault'))return x=>({default:x});if(id.includes('regenerator'))return {default:{mark:fn=>fn,wrap:fn=>fn}};if(id.includes('typeof'))return x=>typeof x;return any()};
vm.createContext(ctx);vm.runInContext(s.slice(ds,de)+';',ctx);const factory=vm.runInContext('(function(require,module,exports){'+s.slice(bs+1,me)+'\n})',ctx);factory(ctx.require,{exports:{}},{});
const rec=ctx._systems.find(x=>x.args[0]==='chunks:///_virtual/milo.ts');
function log(name,...a){console.log(name,...a.map(x=>{try{return JSON.stringify(x)}catch{return String(x)}}))}
const store={openid:'OID',ieg_ams_session_token:'ST',acctype:'AC',verifysession:'VS'};
function runtime(name){return (...args)=>{log(name,...args);const o=args[0];if(name==='getLoginCode'||name==='login'){o?.success?.({code:'RUNTIME-CODE'})}else if(name==='request'){o?.success?.({data:{errcode:0,openid:'OID',ieg_ams_session_token:'ST',ieg_ams_token:'AT',ieg_ams_token_time:'TIME',ieg_ams_token_v2:'AT2',unionid:'UID'}})}else if(name==='getStorageSync')return store[args[0]]||'';return any()}}
ctx.qq=new Proxy({}, {get:(t,k)=>runtime('qq.'+String(k))});ctx.wx=new Proxy({}, {get:(t,k)=>runtime('wx.'+String(k))});
for(const setter of rec.reg.setters||[])setter(any());rec.reg.execute();const m=rec.exports.milo;
console.log('MILO_KEYS',Object.getOwnPropertyNames(m));
try{m.init({miniappid:'1112386029',showArea:'qq',isQQ:true});}catch(e){console.log('INIT_ERR',e.stack)}
try{m.checkLogin(x=>log('LOGIN_OK',x),x=>log('LOGIN_ERR',x));}catch(e){console.log('CHECK_ERR',e.stack)}
try{m.getQQUserOpenid('CODE',x=>log('QQ_OK',x),x=>log('QQ_ERR',x));}catch(e){console.log('QQ_ERR_THROW',e.stack)}
try{m.getWXUserOpenid('CODE',x=>log('WX_OK',x),x=>log('WX_ERR',x));}catch(e){console.log('WX_ERR_THROW',e.stack)}
