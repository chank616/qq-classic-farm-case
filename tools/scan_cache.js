#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || String.raw`C:\Users\chank616\AppData\Roaming\QQEX\miniapp\temps\miniapp_src`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const versions = fs.readdirSync(root, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => {
    const dir = path.join(root, e.name);
    const files = walk(dir);
    const project = readJson(path.join(dir, 'project.config.json')) || {};
    const game = readJson(path.join(dir, 'game.json')) || {};
    const textFiles = files.filter(f => /\.(js|html|json|ts)$/i.test(f));
    const text = textFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const hit = pattern => (text.match(pattern) || []).length;
    return {
      folder: e.name,
      project: project.projectname || null,
      appid: project.appid || null,
      fileCount: files.length,
      bytes: files.reduce((n, f) => n + fs.statSync(f).size, 0),
      hasMcboot: files.some(f => f.toLowerCase().includes('mcboot')),
      subpackages: game.subpackages || [],
      indicators: {
        wxLogin: hit(/wx\.login/gi),
        wxCode: hit(/wxcode/gi),
        jsCode: hit(/js_code/gi),
        sessionToken: hit(/ieg_ams_session_token/gi),
        tokenTime: hit(/ieg_ams_token_time/gi),
        connectSocket: hit(/wx\.connectSocket/gi),
        localSink: hit(/127\.0\.0\.1:17841/gi),
      },
    };
  })
  .sort((a, b) => String(b.project).localeCompare(String(a.project), undefined, { numeric: true }));

console.log(JSON.stringify({ root, versions }, null, 2));
