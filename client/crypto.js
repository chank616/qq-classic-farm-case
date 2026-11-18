'use strict';

// AES-GCM transport crypto matching the game's GcmCrypto:
//   - AES key: 16 / 24 / 32 bytes, supplied by wx.getUserCryptoManager().getLatestUserKey()
//   - nonce:   12 bytes, supplied by wx.getUserCryptoManager().getRandomValues()
//   - AAD:     4-byte big-endian client sequence
//   - output:  raw bytes of  nonce(12) || ciphertext || GCM tag(16)
// The game wraps that output in Base64 and immediately decodes it back to bytes
// before placing it in gatepb.Message.body, so the wire form is the raw layout.

const webcrypto = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
  ? globalThis.crypto
  : null;

function seqToAad(seq) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, Number(seq) >>> 0, false);
  return out;
}

function base64Encode(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64Decode(str) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function getCrypto() {
  if (webcrypto) return webcrypto;
  // Node < 19 fallback.
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.webcrypto;
}

async function importKey(keyBytes) {
  const key = keyBytes instanceof Uint8Array ? keyBytes : Uint8Array.from(keyBytes);
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error('AES key must be 16/24/32 bytes, got ' + key.length);
  }
  const c = await getCrypto();
  return c.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Returns Uint8Array: nonce || ciphertext || tag
async function encryptBody(payloadBytes, keyBytes, nonceBytes, seq) {
  const nonce = nonceBytes instanceof Uint8Array ? nonceBytes : Uint8Array.from(nonceBytes);
  // GcmCrypto documents 12-byte nonces, but this runtime's getUserCryptoManager
  // returns a 16-byte `iv`; WebCrypto accepts either, so pass it through as-is.
  if (!nonce.length) throw new Error('nonce must not be empty');
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const ct = await c.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: seqToAad(seq), tagLength: 128 },
    key,
    payloadBytes,
  );
  const out = new Uint8Array(nonce.length + ct.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ct), nonce.length);
  return out;
}

// Accepts either the raw layout (nonce||ct||tag) or the Base64 text form.
// nonceLen defaults to 12 but the runtime's host key uses a 16-byte iv, so
// callers may probe several lengths.
async function decryptBody(bodyBytes, keyBytes, seq, nonceLen = 12) {
  let raw = bodyBytes;
  if (typeof raw === 'string') raw = base64Decode(raw);
  if (raw.length < nonceLen + 16) throw new Error('ciphertext too short: ' + raw.length);
  const nonce = raw.subarray(0, nonceLen);
  const ct = raw.subarray(nonceLen);
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const plain = await c.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: seqToAad(seq), tagLength: 128 },
    key,
    ct,
  );
  return new Uint8Array(plain);
}

// AES-CBC fallback: the host key bundle (16-byte encryptKey + 16-byte iv) is a
// classic CBC pair, so the wire body may be CBC rather than GCM.
async function encryptBodyCbc(payloadBytes, keyBytes, ivBytes) {
  const iv = ivBytes instanceof Uint8Array ? ivBytes : Uint8Array.from(ivBytes);
  if (iv.length !== 16) throw new Error('CBC iv must be 16 bytes, got ' + iv.length);
  const c = await getCrypto();
  const key = await c.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  const ct = await c.subtle.encrypt({ name: 'AES-CBC', iv }, key, payloadBytes);
  return new Uint8Array(ct);
}

async function decryptBodyCbc(bodyBytes, keyBytes, ivBytes) {
  const iv = ivBytes instanceof Uint8Array ? ivBytes : Uint8Array.from(ivBytes);
  const c = await getCrypto();
  const key = await c.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  const plain = await c.subtle.decrypt({ name: 'AES-CBC', iv }, key, bodyBytes);
  return new Uint8Array(plain);
}

// Raw GCM decrypt with an explicit nonce (no layout assumptions), used when
// verifying captured traffic against candidate parameter sets.
async function decryptRaw(ctBytes, keyBytes, nonceBytes, seq) {
  const nonce = nonceBytes instanceof Uint8Array ? nonceBytes : Uint8Array.from(nonceBytes);
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const plain = await c.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: seqToAad(seq), tagLength: 128 },
    key,
    ctBytes,
  );
  return new Uint8Array(plain);
}

// Raw GCM decrypt with explicit AAD bytes (null = no additionalData).
async function decryptRawAad(ctBytes, keyBytes, nonceBytes, aadBytes) {
  const nonce = nonceBytes instanceof Uint8Array ? nonceBytes : Uint8Array.from(nonceBytes);
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const alg = { name: 'AES-GCM', iv: nonce, tagLength: 128 };
  if (aadBytes) alg.additionalData = aadBytes;
  const plain = await c.subtle.decrypt(alg, key, ctBytes);
  return new Uint8Array(plain);
}

module.exports = {
  seqToAad, base64Encode, base64Decode,
  encryptBody, decryptBody, encryptBodyCbc, decryptBodyCbc, decryptRaw, decryptRawAad,
};
