'use strict';

const { APP_ID, exchangeCode } = require('./ams-login');

function isSessionInvalid(error) {
  return Boolean(error && (
    error.httpStatus === 401 || error.httpStatus === 403 ||
    error.sessionInvalid === true || error.code === 'SESSION_EXPIRED'
  ));
}

class OfficialSession {
  constructor({ platform = 'qq', appId = APP_ID, loginCodeProvider, transport, initialCookie = {} } = {}) {
    if (typeof loginCodeProvider !== 'function') throw new TypeError('loginCodeProvider must be a function');
    this.platform = platform;
    this.appId = appId;
    this.loginCodeProvider = loginCodeProvider;
    this.transport = transport;
    this.cookie = { ...initialCookie };
    this.session = null;
    this.loginCount = 0;
  }

  async login() {
    // A new host-issued code is required for every fresh exchange. The old
    // code is never extended or replayed by this class.
    const code = await this.loginCodeProvider();
    if (typeof code !== 'string' || code.length === 0) throw new Error('loginCodeProvider returned no code');
    const session = await exchangeCode({
      platform: this.platform,
      appId: this.appId,
      code,
      cookie: this.cookie,
      transport: this.transport,
    });
    this.session = session;
    this.cookie = { ...this.cookie, ...session };
    this.loginCount += 1;
    return session;
  }

  invalidate() { this.session = null; }

  async withSession(operation) {
    if (typeof operation !== 'function') throw new TypeError('operation must be a function');
    if (!this.session) await this.login();
    try {
      return await operation(this.session);
    } catch (error) {
      if (!isSessionInvalid(error)) throw error;
      this.invalidate();
      await this.login();
      return operation(this.session);
    }
  }
}

module.exports = { OfficialSession, isSessionInvalid };
