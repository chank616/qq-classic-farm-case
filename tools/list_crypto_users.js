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
ctx.require=(id)=>{if(id.includes('interopRequireDefault'))return x=>({default:x});if(id.includes('regenerator'))return {default:{mark:(fn)=>fn,wrap:(fn)=>fn}};if(id.includes('typeof'))return x=>typeof x;return any();};
vm.createContext(ctx);vm.runInContext(s.slice(decStart,decEnd)+';',ctx);
const factory=vm.runInContext('(function(require,module,exports){'+s.slice(bodyStart+1,modEnd)+'\n})',ctx);
factory(ctx.require,{exports:{}},{});
console.log('systems',ctx._systems.length);
for(const rec of ctx._systems){const id=String(rec.args[0]),deps=rec.args[1];if(Array.isArray(deps)&&deps.some(d=>/crypto|encrypt|milo|network|websocket|socket|rpc|service/i.test(String(d))))console.log(id,JSON.stringify(deps))}
