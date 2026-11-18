// Offline VM probe for the milo login wrapper. It supplies only inert stubs
// and records request-shaped arguments; it never invokes wx/qq or the network.
const fs=require('fs'), vm=require('vm');
const p='C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const s=fs.readFileSync(p,'utf8');
const ds=s.indexOf('globalThis._Аce_7716=function(){'),de=s.indexOf('}();var',ds)+3,ms=s.indexOf('define("assets/main/index.4fbdd.js"'),bs=s.indexOf('{',ms),me=s.indexOf('\n});\ndefine(',bs);
const calls=[];
function primitive(name){ return (...args)=>{ calls.push({type:'call',name,args:args.map(a=>safe(a))}); return proxy(name+'()'); }; }
function safe(v){ if(v===null||v===undefined||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return v; if(v instanceof Uint8Array)return {type:'Uint8Array',length:v.length}; if(Array.isArray(v))return v.map(safe); if(typeof v==='object'){const o={};for(const k of Object.keys(v).slice(0,30))o[k]=safe(v[k]);return o;}return typeof v; }
function proxy(name){ const fn=primitive(name); return new Proxy(fn,{get(t,k){if(k===Symbol.toPrimitive)return()=>name;if(k==='toString')return()=>name;if(k==='valueOf')return()=>name; if(k==='then')return undefined; calls.push({type:'get',name,key:String(k)}); return proxy(name+'.'+String(k));},apply(t,th,args){return primitive(name)(...args)},construct(){return proxy('new '+name)}}); }
const ctx={console,Function,Date,JSON,Array,Object,String,Number,Boolean,RegExp,Math,Uint8Array,Int8Array,decodeURIComponent,encodeURIComponent,parseInt,parseFloat,globalThis:null};ctx.globalThis=ctx;ctx.window=proxy('window');ctx.document=proxy('document');ctx.canvas=proxy('canvas');ctx.cc=proxy('cc');ctx.qq=proxy('qq');ctx.wx=proxy('wx');ctx._systems=[];
ctx.System=new Proxy({}, {get:(t,k)=>(...args)=>{const rec={key:String(k),args,exports:{}};ctx._systems.push(rec);if(typeof args[2]==='function')try{const ex=(name,val)=>{if(typeof name==='string')rec.exports[name]=val;else if(name&&typeof name==='object')Object.assign(rec.exports,name);return proxy('export')};rec.reg=args[2](ex)}catch(e){rec.regError=String(e)}return proxy('System')}});
ctx.require=(id)=>{if(id.includes('interopRequireDefault'))return x=>({default:x});if(id.includes('regenerator'))return {default:{mark:fn=>fn,wrap:fn=>fn}};if(id.includes('typeof'))return x=>typeof x;return proxy('require:'+id)};
vm.createContext(ctx);vm.runInContext(s.slice(ds,de)+';',ctx);const factory=vm.runInContext('(function(require,module,exports){'+s.slice(bs+1,me)+'\n})',ctx);factory(ctx.require,{exports:{}},{});
const rec=ctx._systems.find(x=>x.args[0]==='chunks:///_virtual/milo.ts');
for(const setter of rec.reg.setters||[])try{setter(proxy('dep'))}catch(e){calls.push({type:'setterError',error:String(e)})};try{rec.reg.execute()}catch(e){calls.push({type:'executeError',error:String(e)})};
const m=rec.exports.milo; const cb=()=>{};
try{m.init({appId:'1112386029',miniappid:'1112386029',platform:'qq',showArea:'qq',isQQ:true})}catch(e){calls.push({type:'initError',error:String(e)})}
try{m.getQQUserOpenid('CODE',cb,cb)}catch(e){calls.push({type:'qqError',error:String(e)})}
try{m.getWXUserOpenid('CODE',cb,cb)}catch(e){calls.push({type:'wxError',error:String(e)})}
const output={module:'milo',calls:calls.slice(-250),conclusion:'Offline dependency probe only; no host API or network was invoked. Primitive values are labels, not runtime secrets.'};
fs.writeFileSync('artifacts/milo-endpoint-probe.json',JSON.stringify(output,null,2));console.log('artifacts/milo-endpoint-probe.json');
