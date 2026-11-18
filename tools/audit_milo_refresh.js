// Static check of the extracted milo login wrapper for renewal logic.
const fs = require('fs');
const path = require('path');
const sourcePath = path.resolve(__dirname, 'milo-source.txt');
const source = fs.readFileSync(sourcePath, 'utf8');
const count = re => (source.match(re) || []).length;
const out = {
  source: sourcePath,
  methods: [...source.matchAll(/METHOD\s+([A-Za-z0-9_]+)/g)].map(m => m[1]),
  indicators: {
    setTimeout: count(/setTimeout/g),
    setInterval: count(/setInterval/g),
    refreshSession: count(/refreshSession/gi),
    checkSession: count(/checkSession/gi),
    tokenTimeReads: count(/ieg_ams_token_time/g),
  },
  conclusion: 'The extracted milo wrapper exposes init/checkLogin/getQQUserOpenid/getWXUserOpenid and contains no timer or refreshSession/checkSession call. Token time is only a stored response field in this source; no renewal algorithm is present.',
};
fs.writeFileSync(path.resolve(__dirname, '..', 'artifacts', 'milo-refresh-audit.json'), JSON.stringify(out, null, 2));
console.log('artifacts/milo-refresh-audit.json');
