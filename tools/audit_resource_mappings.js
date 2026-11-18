const fs=require('fs'),path=require('path');
const root=String.raw`C:\Users\chank616\AppData\Roaming\QQEX\miniapp\fs\2351686624\1112386029\usr\gamecaches`;
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,a);else a.push(p)}return a}
const all=walk(root),exts={},roots={};for(const p of all){const e=path.extname(p).toLowerCase()||'<none>';exts[e]=(exts[e]||0)+1;const rel=path.relative(root,p),part=rel.split(path.sep)[0];roots[part]=(roots[part]||0)+1}
console.log('files',all.length,'extensions',exts,'dirs',roots);
const idx=JSON.parse(fs.readFileSync(path.join(root,'cacheList.json'),'utf8')).files;
const special=Object.entries(idx).filter(([u,m])=>/\.(js|mjs|cjs|wasm|proto|pb|csv|xlsx|xml|txt)(\?|$)/i.test(u));console.log('mapped code/data extensions',special.length);for(const [u,m] of special.slice(0,80))console.log(u,'=>',m.url||'');
const ptn=/cropid|seedid|growtime|maturetime|levelrequire|levellimit|planttime|harvesttime|种植|成熟|收获|免费化肥|农场等级/ig;let hits=[];let jsons=all.filter(p=>p.endsWith('.json')&&!p.endsWith('cacheList.json'));for(const p of jsons){let s;try{s=fs.readFileSync(p,'utf8')}catch{continue}const m=[...s.matchAll(ptn)];if(m.length)hits.push({path:path.relative(root,p),bytes:s.length,count:m.length,terms:[...new Set(m.slice(0,20).map(x=>x[0]))]})}
console.log('candidate gameplay-config keyword files',hits.length);for(const h of hits.slice(0,80))console.log(JSON.stringify(h));
