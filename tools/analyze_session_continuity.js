const fs = require('fs');
const path = require('path');

const input = process.argv[2] || path.resolve('artifacts/wsframes-analysis.json');
const output = process.argv[3] || path.resolve('artifacts/session-continuity-summary.json');
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const heartbeats = (data.events || [])
  .filter(event => event.dir === 'S' && /UserService\/Heartbeat$/.test(event.method || ''))
  .map(event => ({ at: event.iso, t: event.t }))
  .sort((a, b) => a.t - b.t);

const clusters = [];
for (const heartbeat of heartbeats) {
  const current = clusters.at(-1);
  if (!current || heartbeat.t - current.lastT > 30_000) {
    clusters.push({ first: heartbeat.at, last: heartbeat.at, firstT: heartbeat.t, lastT: heartbeat.t, requests: 1 });
  } else {
    current.last = heartbeat.at;
    current.lastT = heartbeat.t;
    current.requests++;
  }
}

const summary = {
  source: path.basename(input),
  heartbeatRequestCount: heartbeats.length,
  clusterGapThresholdMs: 30_000,
  clusters: clusters.map(({ first, last, firstT, lastT, requests }) => ({
    first,
    last,
    spanMs: lastT - firstT,
    requests,
  })),
  maxObservedClusterSpanMs: clusters.reduce((max, cluster) => Math.max(max, cluster.lastT - cluster.firstT), 0),
  continuousThreeHourRunObserved: clusters.some(cluster => cluster.lastT - cluster.firstT >= 3 * 60 * 60 * 1000),
  interpretation: 'Heartbeat frame timestamps show short bursts only. Gaps in the capture do not prove a socket remained connected; this file does not establish code TTL or AMS token lifetime.',
};

fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
