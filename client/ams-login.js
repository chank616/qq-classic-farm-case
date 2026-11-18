'use strict';

const APP_ID = '1112386029';
const ENDPOINTS = Object.freeze({
  qq: 'https://ams.game.qq.com/ams/userLoginSvr',
  wx: 'https://mini.game.qq.com/ams/ame/wxApi',
});

function assertPlatform(platform) {
  if (platform !== 'qq' && platform !== 'wx') {
    throw new TypeError(`unsupported platform: ${platform}`);
  }
}

function buildCookie(values = {}) {
  const get = key => values[key] == null ? '' : String(values[key]);
  // Order and names match the cached milo wrapper's request construction.
  return [
    `openid=${get('openid')}`,
    'acctype=qqmini',
    `appid=${get('appid') || APP_ID}`,
    `ieg_ams_session_token=${get('ieg_ams_session_token')}`,
    `ieg_ams_token=${get('ieg_ams_token')}`,
    `ieg_ams_token_time=${get('ieg_ams_token_time')}`,
    `verifysession=${get('verifysession')}`,
  ].join('; ');
}

function buildExchangeRequest({ platform, code, appId = APP_ID, cookie = {} }) {
  assertPlatform(platform);
  if (typeof code !== 'string' || code.length === 0) throw new TypeError('code must be a non-empty string');
  const url = new URL(ENDPOINTS[platform]);
  const data = platform === 'qq'
    ? { a: 'qqCodeToSession', appid: String(appId), js_code: code }
    : { action: 'codeToSession', appid: String(appId), wxcode: code };
  for (const [key, value] of Object.entries(data)) url.searchParams.set(key, value);
  return {
    url: url.toString(),
    method: 'GET',
    headers: {
      'Content-Type': 'application/json;',
      Cookie: buildCookie({ ...cookie, appid: appId }),
    },
  };
}

function normalizeExchangeResponse(body) {
  if (!body || typeof body !== 'object') throw new Error('AMS response is not an object');
  const errorCode = body.errcode ?? body.err_code ?? body.code;
  if (Number(errorCode) !== 0) {
    const error = new Error(`AMS login failed: ${String(errorCode ?? 'unknown')}`);
    error.gatewayErrorCode = errorCode;
    error.response = body;
    throw error;
  }
  const session = {
    openid: body.openid,
    ieg_ams_session_token: body.ieg_ams_session_token,
    ieg_ams_token: body.ieg_ams_token,
    ieg_ams_token_time: body.ieg_ams_token_time,
    ieg_ams_token_v2: body.ieg_ams_token_v2,
    unionid: body.unionid,
  };
  if (!session.openid || !session.ieg_ams_session_token || !session.ieg_ams_token) {
    const error = new Error('AMS response did not contain the required session fields');
    error.response = body;
    throw error;
  }
  return Object.freeze(session);
}

async function exchangeCode({ platform, code, appId = APP_ID, cookie = {}, transport }) {
  const request = buildExchangeRequest({ platform, code, appId, cookie });
  const send = transport || (async req => {
    const response = await fetch(req.url, { method: req.method, headers: req.headers });
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const error = new Error(`AMS HTTP ${response.status}`);
      error.httpStatus = response.status;
      error.response = body;
      throw error;
    }
    return body;
  });
  return normalizeExchangeResponse(await send(request));
}

module.exports = { APP_ID, ENDPOINTS, buildCookie, buildExchangeRequest, normalizeExchangeResponse, exchangeCode };
