const fs=require('fs'),path=require('path');
const root='C:/Users/chank616/AppData/Roaming/QQEX/miniapp';
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,a);else a.push(p)}return a}
const all=walk(root);const hits=all.filter(p=>/mcboot|1112386029|cacheList/i.test(p));
for(const p of hits){let s='';try{s=fs.readFileSync(p); }catch{} if(/mcboot|TaskInfo|ClaimDailyReward|QQVip|GetQQVipRewardsStatus/i.test(p+' '+s.toString('utf8'))){console.log(p,s.length)}}
