require('./run_main.js');
for(const [i,r] of globalThis.__systems?.entries?.()||[]){const src=r.reg?.execute?.toString?.()||'';if(src.includes('js_code')||src.includes('wxcode')||src.includes('ClaimQQVipRewards'))console.log(i,r.args[0],src.indexOf('js_code'),src.indexOf('wxcode'),src.slice(Math.max(0,src.indexOf('js_code')-500),src.indexOf('js_code')+700));}
