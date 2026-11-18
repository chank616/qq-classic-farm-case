'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildExchangeRequest, normalizeExchangeResponse } = require('../client/ams-login');
const { OfficialSession } = require('../client/session-manager');

test('builds the verified QQ AMS exchange request shape', () => {
  const request = buildExchangeRequest({ platform: 'qq', code: 'CODE', cookie: { openid: 'old' } });
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://ams.game.qq.com/ams/userLoginSvr');
  assert.deepEqual(Object.fromEntries(url.searchParams), { a: 'qqCodeToSession', appid: '1112386029', js_code: 'CODE' });
  assert.equal(request.method, 'GET');
  assert.match(request.headers.Cookie, /openid=old/);
  assert.match(request.headers.Cookie, /acctype=qqmini/);
});

test('builds the verified WX AMS exchange request shape', () => {
  const request = buildExchangeRequest({ platform: 'wx', code: 'CODE' });
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://mini.game.qq.com/ams/ame/wxApi');
  assert.deepEqual(Object.fromEntries(url.searchParams), { action: 'codeToSession', appid: '1112386029', wxcode: 'CODE' });
});

test('requires the session fields observed in the wrapper', () => {
  assert.throws(() => normalizeExchangeResponse({ errcode: 0, openid: 'o' }), /required session fields/);
  assert.deepEqual(normalizeExchangeResponse({ errcode: 0, openid: 'o', ieg_ams_session_token: 's', ieg_ams_token: 't' }).openid, 'o');
});

test('reacquires a new host code only after an explicit session-invalid result', async () => {
  const codes = ['CODE1', 'CODE2'];
  const requests = [];
  const session = new OfficialSession({
    loginCodeProvider: async () => codes.shift(),
    transport: async request => {
      requests.push(request);
      return { errcode: 0, openid: 'o', ieg_ams_session_token: `s${requests.length}`, ieg_ams_token: `t${requests.length}` };
    },
  });
  let calls = 0;
  const result = await session.withSession(async () => {
    calls += 1;
    if (calls === 1) { const error = new Error('expired'); error.sessionInvalid = true; throw error; }
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(session.loginCount, 2);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /js_code=CODE1/);
  assert.match(requests[1].url, /js_code=CODE2/);
});
