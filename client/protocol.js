'use strict';

const { encodeMessage, decodeMessage } = require('./pb');
const { registry, services } = require('./schema');

const MESSAGE_TYPE = Object.freeze({ REQUEST: 1, RESPONSE: 2, NOTIFY: 3 });

// The game's AceManager.randomStr(): 64..127 random chars from a bundle-local
// charset plus a trailing '='. The exact charset is not statically recoverable;
// this is the base64-ish alphabet used by the surrounding encoder.
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function randomToken(random = Math.random) {
  const n = Math.floor(64 * random()) + 64;
  let out = '';
  for (let i = 0; i < n; i++) out += TOKEN_ALPHABET.charAt(Math.floor(random() * TOKEN_ALPHABET.length));
  return out + '=';
}

// Build the outer gatepb.Message frame.
// body is already-encrypted bytes (see crypto.encryptBody).
function buildFrame({ service, method, messageType = MESSAGE_TYPE.REQUEST, seq, body, token }) {
  const meta = {
    service_name: service,
    method_name: method,
    message_type: messageType,
    client_seq: seq,
    server_seq: 0,
  };
  const payload = encodeMessage('gatepb.Message', {
    meta,
    body: body || new Uint8Array(0),
    token: token === undefined ? randomToken() : token,
  }, registry);
  return payload;
}

function parseFrame(bytes) {
  const msg = decodeMessage('gatepb.Message', bytes, registry);
  return {
    meta: msg.meta || {},
    body: msg.body || new Uint8Array(0),
    token: msg.token,
    raw: msg,
  };
}

function lookup(service, method) {
  const svc = services[service];
  if (!svc) throw new Error('unknown service: ' + service);
  const entry = svc[method];
  if (!entry) throw new Error('unknown method: ' + service + '/' + method);
  return { requestType: entry[0], responseType: entry[1] };
}

// Encode a business request payload (before transport encryption).
function encodeRequest(service, method, message) {
  const { requestType } = lookup(service, method);
  return encodeMessage(requestType, message || {}, registry);
}

// Decode a business response payload (after transport decryption).
function decodeResponse(service, method, bytes) {
  const { responseType } = lookup(service, method);
  return decodeMessage(responseType, bytes, registry);
}

// Transport-agnostic client. `transport` must provide:
//   send(Uint8Array) -> void|Promise
//   onMessage(cb)    -> void          (cb receives Uint8Array)
//   onClose(cb)      -> void
class FarmClient {
  constructor({ transport, tokenFactory } = {}) {
    this.transport = transport;
    this.tokenFactory = tokenFactory || randomToken;
    this.clientSeq = 1;
    this.pending = new Map();
    this.notifyHandlers = [];
    this.closed = false;
    if (transport) {
      transport.onMessage(bytes => this._onFrame(bytes).catch(err => this._failAll(err)));
      transport.onClose && transport.onClose(reason => {
        this.closed = true;
        this._failAll(new Error('transport closed: ' + reason));
      });
    }
  }

  reset() { this.clientSeq = 1; }

  async sendRaw(service, method, frameBytes, token) {
    const seq = this.clientSeq++;
    const frame = buildFrame({
      service, method, messageType: MESSAGE_TYPE.REQUEST, seq,
      body: frameBytes, token: token === undefined ? this.tokenFactory() : token,
    });
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error('timeout waiting for response to ' + service + '/' + method + ' seq=' + seq));
      }, 15000);
      this.pending.set(seq, { resolve, reject, timer, service, method });
    });
    await this.transport.send(frame);
    return promise;
  }

  // request(payload): payload is the raw business bytes (already encrypted).
  // Returns the raw response business bytes.
  request(service, method, bodyBytes) {
    return this.sendRaw(service, method, bodyBytes);
  }

  onNotify(handler) { this.notifyHandlers.push(handler); }

  async _onFrame(bytes) {
    const frame = parseFrame(bytes);
    const meta = frame.meta;
    const type = Number(meta.message_type);
    if (type === MESSAGE_TYPE.RESPONSE) {
      const seq = Number(meta.client_seq);
      const entry = this.pending.get(seq);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(seq);
        entry.resolve({ meta, body: frame.body });
      }
      return;
    }
    for (const handler of this.notifyHandlers) {
      try { handler({ meta, body: frame.body }); } catch (_) {}
    }
  }

  _failAll(err) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}

module.exports = {
  MESSAGE_TYPE, TOKEN_ALPHABET, randomToken,
  buildFrame, parseFrame, encodeRequest, decodeResponse, lookup, FarmClient,
};
