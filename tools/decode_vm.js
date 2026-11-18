const fs=require('fs'), vm=require('vm');
const p='C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const s=fs.readFileSync(p,'utf8');
const start=s.indexOf('globalThis._Аce_7716=function(){');
const end=s.indexOf('}();var',start)+3;
console.log({start,end,head:s.slice(start,start+40),tail:s.slice(end-10,end+10)});
const ctx={console,globalThis:null,Function,Date,JSON,Array,Object,String,Number,Boolean,RegExp,Math,Uint8Array,Int8Array,decodeURIComponent,encodeURIComponent};ctx.globalThis=ctx;
vm.createContext(ctx); vm.runInContext(s.slice(start,end)+';',ctx);
console.log(typeof ctx._Аce_7716);
const b64=s.slice(16530+0,0); // placeholder
console.log(ctx._Аce_7716('PiwoFAgUoAEoFggWjgEaFgAWHAAUFkACCkIWIhYoFggWzgEoFAgUjgEaFAAUHAAWFCgUCBSCASgWCBaOARoWABYcABQWKBYIFoQBKBQIFM4BGhQAFBwAFhQoFAgUygEoFggWjgEaFgAWHAAUFigWCBb0ASgUCBSOARoUABQcABYUKBQIFOABKBYIFo4BGhYAFhwAFBYMFiAW',false) ? 'decoded' : 'none');
