const fs = require('fs');

const input = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr/wsframes.jsonl';
const output = process.argv[3] || 'artifacts/login-lifecycle.json';
const events = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const groups = new Map();
for (const event of events.filter(x => x.dir === 'OPEN')) {
  const url = new URL(event.url);
  const code = url.searchParams.get('code') || '';
  const version = url.searchParams.get('ver') || '';
  const old = groups.get(code) || { version, first: event.t, last: event.t, count: 0 };
  old.first = Math.min(old.first, event.t);
  old.last = Math.max(old.last, event.t);
  old.count++;
  groups.set(code, old);
}
const rows = [...groups.values()].map((x, i) => ({
  id: i + 1,
  version: x.version,
  count: x.count,
  first: new Date(x.first).toISOString(),
  last: new Date(x.last).toISOString(),
  spanMs: x.last - x.first,
}));
const byVersion = {};
for (const row of rows) (byVersion[row.version] ||= []).push(row);
const result = {
  openCount: events.filter(x => x.dir === 'OPEN').length,
  uniqueCodeCount: groups.size,
  closeCount: events.filter(x => x.dir === 'CLOSE').length,
  errorCount: events.filter(x => x.dir === 'ERROR').length,
  byVersion: Object.fromEntries(Object.entries(byVersion).map(([version, list]) => [version, {
    connections: list.length,
    reused: list.filter(x => x.count > 1).length,
    maxReuse: Math.max(...list.map(x => x.count)),
    groups: list,
  }])),
};
fs.mkdirSync(require('path').dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
