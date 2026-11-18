const fs=require('fs');
const p='C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const s=fs.readFileSync(p,'utf8');
let i=s.indexOf('globalThis._Аce_7716=function(){');
console.log('start',i);
console.log(s.slice(i+9000,i+14000));
