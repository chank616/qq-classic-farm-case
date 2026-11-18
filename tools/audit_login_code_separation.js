// Prove where the runtime code appears in the captured transport and where
// the first Login RPC gets its protobuf fields.  Values are redacted.
const fs = require('fs');
const path = require('path');
const rawPath = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr/wsframes.jsonl';
const analysisPath = path.resolve(__dirname, '..', 'artifacts', 'wsframes-analysis.json');
const schemaPath = path.resolve(__dirname, '..', 'artifacts', 'proto-schema-full.json');
const outPath = path.resolve(__dirname, '..', 'artifacts', 'login-code-separation.json');

const raw = fs.readFileSync(rawPath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const opens = raw.filter(x => x.dir === 'OPEN');
const openInfo = opens.map(x => {
  const u = new URL(x.url);
  return {
    host: u.host,
    path: u.pathname,
    queryKeys: [...u.searchParams.keys()].sort(),
    hasCodeQuery: u.searchParams.has('code'),
    codeLength: (u.searchParams.get('code') || '').length,
    version: u.searchParams.get('ver'),
    platform: u.searchParams.get('platform'),
  };
});
const login = analysis.events.find(x => x.dir === 'S' && x.method === 'gamepb.userpb.UserService/Login');
const loginSchema = schema.modules.userpb.LoginRequest;
const result = {
  source: { raw: rawPath, analysis: analysisPath, schema: schemaPath },
  scope: 'Read-only structural audit; code and payload bytes are not retained.',
  openUrl: {
    count: openInfo.length,
    distinctHosts: [...new Set(openInfo.map(x => x.host))],
    distinctPaths: [...new Set(openInfo.map(x => x.path))],
    allContainCodeQuery: openInfo.every(x => x.hasCodeQuery),
    codeLengths: [...new Set(openInfo.map(x => x.codeLength))].sort((a, b) => a - b),
    queryKeys: [...new Set(openInfo.flatMap(x => x.queryKeys))].sort(),
    versions: [...new Set(openInfo.map(x => x.version))].sort(),
    platforms: [...new Set(openInfo.map(x => x.platform))].sort(),
  },
  firstLoginRpc: login ? {
    timestamp: new Date(login.t).toISOString(),
    direction: login.dir,
    method: login.method,
    envelopeFieldSummary: login.envelopeFields,
    requestFlags: login.requestFlags,
    schemaType: 'gamepb.userpb.LoginRequest',
    schemaFields: loginSchema.fields,
    schemaContainsCodeField: loginSchema.fields.some(f => /code|token|session/i.test(f.name)),
  } : null,
  conclusion: 'The runtime code is present as the WebSocket OPEN URL query parameter. The first Login RPC is a separate encrypted protobuf request; its extracted LoginRequest schema has no code/token/session field. This separates code transport from the Login RPC body but does not reveal code generation, TTL, or decryption keys.',
};
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(outPath);
