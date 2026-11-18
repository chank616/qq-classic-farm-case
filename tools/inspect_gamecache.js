const fs=require('fs'),path=require('path');
const root='C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr/gamecaches';
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,a);else a.push(p)}return a}
const terms=['TaskInfo','ClaimDailyReward','ClaimQQVipRewards','AllLands','Plant','Harvest','Heartbeat','ieg_ams','openid','token','https://','wss://','service','method'];
const out=[];
for(const p of walk(root)){let s;try{s=fs.readFileSync(p,'utf8')}catch{continue};let hits=terms.filter(t=>s.includes(t));if(hits.length){out.push({file:p.replace(root,''),bytes:s.length,hits,sample:s.slice(0,300)});}}
console.log(JSON.stringify(out,null,2));
