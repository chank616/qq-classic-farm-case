'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connect, VERSION } = require('./farm-transport');
const { runWorkflow, chinaDay, stockFromBag } = require('./farm-workflow');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'artifacts');
const DRY = process.argv.includes('--dry');
const LOGIN_ONLY = process.argv.includes('--login-only');
const RUN_ID = crypto.randomUUID();
let connection;
const events = [];
function emit(event) {
  events.push(fetch((process.env.FARM_SINK || 'http://127.0.0.1:17841') + '/evt', {
    method: 'POST', body: JSON.stringify({ ...event, runId: RUN_ID }), signal: AbortSignal.timeout(4000),
  }).catch(() => {}));
}
function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}
async function main() {
  fs.mkdirSync(ART, { recursive: true });
  let lock;
  const lockFile = path.join(ART, 'farm-client.lock');
  try { lock = fs.openSync(lockFile, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try { previous = Number(fs.readFileSync(lockFile, 'utf8')); process.kill(previous, 0); }
    catch (e) {
      if (e.code === 'ESRCH' || !previous) { fs.unlinkSync(lockFile); lock = fs.openSync(lockFile, 'wx'); }
      else throw e;
    }
    if (lock === undefined) throw new Error('Another farm client is already running');
  }
  fs.writeFileSync(lock, String(process.pid));
  let heartbeat;
  try {
    emit({ type: 'pass-started', mode: DRY ? 'inspection' : 'execute' });
    connection = await connect();
    const device_info = { client_version: VERSION, sys_software: 'Windows', sys_hardware: 'PC', network: 'wifi' };
    const login = await connection.rpc('gamepb.userpb.UserService', 'Login', { device_info });
    if (login.err || !login.decoded?.basic) throw new Error('Login failed: ' + login.err);
    const player = await connection.rpc('gamepb.userpb.UserService', 'PlayerLogin', { device_info });
    if (player.err || !player.decoded?.global_scene_id) throw new Error('PlayerLogin failed: ' + player.err);
    const basic = player.decoded.basic || login.decoded.basic;
    const scene = Number(player.decoded.global_scene_id);
    const serverMillis = Number(player.decoded.time_now_millis || login.decoded.time_now_millis) || Date.now();
    const offset = serverMillis - Date.now();
    const now = () => Math.floor((Date.now() + offset) / 1000);
    const resource = await connection.rpc('gamepb.itempb.ItemService', 'GetBag', { global_scene_id: scene, tab_id: 2 });
    if (resource.err) throw new Error('GetBag failed: ' + resource.err);
    const bag = stockFromBag(resource.decoded || {});
    emit({ type: 'profile', name: basic.name, gid: String(basic.gid), level: Number(basic.level), gold: Number(basic.gold), exp: Number(basic.exp),
      points: bag.get(1002) || 0, diamonds: bag.get(1004) || 0, fertHours: (bag.get(1011) || 0) / 3600, fertOrgHours: (bag.get(1012) || 0) / 3600 });
    console.log('Login verified; level=' + basic.level + '; mode=' + (DRY ? 'inspection' : 'execute'));
    heartbeat = setInterval(() => connection.rpc('gamepb.userpb.UserService', 'Heartbeat', { host_gid: basic.gid, client_version: VERSION, host_type: 0 }).catch(() => {}), 25000);
    heartbeat.unref();
    if (LOGIN_ONLY) { console.log('Login-only check; no daily completion recorded'); return; }
    const statePath = path.join(ART, 'farm-schedule.json');
    let state = {}; try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (_) {}
    const report = await runWorkflow({ rpc: connection.rpc, basic, scene, dry: DRY, emit, now,
      config: { previousFertilizerDecision: state.fertilizerDecision } });
    report.runId = RUN_ID;
    report.serverClockOffsetMs = offset;
    const name = 'farm-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + RUN_ID.slice(0, 8) + '.json';
    const reportPath = path.join(ART, 'reports', name);
    saveJson(reportPath, report);
    saveJson(path.join(ART, DRY ? 'farm-inspection.json' : 'farm-status.json'), { ...report, reportPath });
    if (!DRY) {
      state.lastAttempt = report.startedAt;
      state.lastPass = report.finishedAt;
      state.day = chinaDay(serverMillis);
      state.lastStatus = report.status;
      state.cropClock = report.cropClock;
      state.fertilizerDecision = report.fertilizerDecisionState;
      if (report.allRequiredComplete) { state.lastVerifiedDay = report.day; state.lastSuccess = report.finishedAt; }
      saveJson(statePath, state);
    }
    emit({ type: DRY ? 'inspection-finished' : 'pass-finished', status: report.status, allRequiredComplete: report.allRequiredComplete, reportPath });
    if (report.allRequiredComplete) emit({ type: 'daily-verified', day: report.day });
    for (const c of report.checks) console.log('[' + c.status + '] ' + c.id + ': ' + JSON.stringify(c.detail));
    console.log('Report: ' + reportPath);
    console.log('ALL_REQUIRED_COMPLETE=' + report.allRequiredComplete);
    process.exitCode = DRY ? 0 : report.allRequiredComplete ? 0 : report.checks.some(c => c.status === 'failed') ? 1 : 2;
  } finally {
    clearInterval(heartbeat);
    connection?.close();
    await Promise.allSettled(events);
    fs.closeSync(lock);
    try { fs.unlinkSync(lockFile); } catch (_) {}
  }
}

if (require.main === module) main().catch(async error => {
  const detail = { generatedAt: new Date().toISOString(), runId: RUN_ID, status: 'failed', allRequiredComplete: false,
    error: String(error.message || error), mode: DRY ? 'inspection' : 'execute' };
  saveJson(path.join(ART, DRY ? 'farm-inspection.json' : 'farm-status.json'), detail);
  console.error(detail.error);
  emit({ type: 'pass-failed', err: detail.error });
  await Promise.allSettled(events);
  process.exitCode = 1;
}).finally(() => { setTimeout(() => process.exit(process.exitCode || 0), 250); });

module.exports = { main };
