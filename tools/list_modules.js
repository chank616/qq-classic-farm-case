const fs = require('fs');
const p = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const s = fs.readFileSync(p, 'utf8');
let n=0;
for (const m of s.matchAll(/define\("([^"]+)"/g)) { if (m[1].includes('ServiceMethodName')) console.log(m.index,m[1]); n++; }
console.log('count',n);
