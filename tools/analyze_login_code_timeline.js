// Read-only, value-safe timeline analysis for the cached WS capture.
// It hashes the code query parameter and never writes the code itself.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const input = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr/wsframes.jsonl';
const output = path.resolve(__dirname, '..', 'artifacts', 'login-code-timeline.json');
const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
const events = lines.map(x => JSON.parse(x));
const boots = events.filter(x => x.dir === 'BOOT');
const opens = events.filter(x => x.dir === 'OPEN');
const closes = events.filter(x => x.dir === 'CLOSE');

function hash(v) { return crypto.createHash('sha256').update(v).digest('hex').slice(0, 16); }
function parseOpen(url) {
  const u = new URL(url);
  const code = u.searchParams.get('code') || '';
  return {
    host: u.host,
    path: u.pathname,
    version: u.searchParams.get('ver') || null,
    platform: u.searchParams.get('platform') || null,
    codeHash: code ? hash(code) : null,
    codeLength: code.length,
  };
}

const sessions = opens.map((o, i) => {
  const nextBoot = boots.find(b => b.t > o.t);
  const nextOpen = opens[i + 1];
  const close = closes.find(c => c.t >= o.t && (!nextBoot || c.t < nextBoot.t));
  const info = parseOpen(o.url);
  return {
    index: i + 1,
    openAt: new Date(o.t).toISOString(),
    openEpochMs: o.t,
    version: info.version,
    host: info.host,
    path: info.path,
    platform: info.platform,
    codeHash: info.codeHash,
    codeLength: info.codeLength,
    bootWaitedMs: boots[i] ? boots[i].waitedMs : null,
    closeAt: close ? new Date(close.t).toISOString() : null,
    closeCode: close ? close.code : null,
    observedOpenToCloseMs: close ? close.t - o.t : null,
    openToNextBootMs: nextBoot ? nextBoot.t - o.t : null,
    openToNextOpenMs: nextOpen ? nextOpen.t - o.t : null,
  };
});

const byCode = new Map();
for (const s of sessions) {
  if (!s.codeHash) continue;
  const a = byCode.get(s.codeHash) || [];
  a.push(s);
  byCode.set(s.codeHash, a);
}
const reuse = [...byCode.entries()].filter(([, a]) => a.length > 1).map(([codeHash, a]) => ({
  codeHash,
  uses: a.length,
  firstOpenAt: a[0].openAt,
  lastOpenAt: a[a.length - 1].openAt,
  spanMs: a[a.length - 1].openEpochMs - a[0].openEpochMs,
  sessionIndexes: a.map(x => x.index),
}));
const observedDurations = sessions.filter(x => x.observedOpenToCloseMs != null).map(x => x.observedOpenToCloseMs);
const result = {
  source: input,
  generatedAt: new Date().toISOString(),
  scope: 'Hashes and timestamps only; code query values are not retained or printed.',
  counts: { totalEvents: events.length, boots: boots.length, opens: opens.length, closes: closes.length },
  sessions,
  reuse,
  observedDurationMs: observedDurations.length ? {
    count: observedDurations.length,
    min: Math.min(...observedDurations),
    max: Math.max(...observedDurations),
    median: observedDurations.sort((a, b) => a - b)[Math.floor(observedDurations.length / 2)],
  } : null,
  conclusion: 'The capture contains 18 OPEN events and 17 distinct code hashes. Any reuse is reported by hash and interval only. Ten OPEN events have a following CLOSE(1006) within their BOOT segment; eight have no observed close, so the capture cannot establish socket lifetime, code TTL, or a three-hour continuous session.',
};
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(output);
