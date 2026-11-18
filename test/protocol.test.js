'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { encodeMessage, decodeMessage } = require('../client/pb');
const { registry, services } = require('../client/schema');
const { seqToAad, encryptBody, decryptBody } = require('../client/crypto');
const {
  MESSAGE_TYPE, buildFrame, parseFrame, encodeRequest, decodeResponse, FarmClient, randomToken,
} = require('../client/protocol');

test('pb roundtrips nested message and varints', () => {
  const msg = {
    basic: { gid: 1079370412, name: 'tester', level: 149, gold: 210000000 },
    time_now_millis: 1792200000000,
    is_first_login: true,
  };
  const bytes = encodeMessage('userpb.LoginReply', msg, registry);
  const back = decodeMessage('userpb.LoginReply', bytes, registry);
  assert.strictEqual(back.basic.gid, 1079370412);
  assert.strictEqual(back.basic.name, 'tester');
  assert.strictEqual(back.basic.level, 149);
  assert.strictEqual(back.time_now_millis, 1792200000000);
  assert.strictEqual(back.is_first_login, true);
});

test('envelope meta carries service/method/seq on the wire', () => {
  const body = Uint8Array.of(9, 8, 7);
  const frame = buildFrame({
    service: 'gamepb.userpb.UserService',
    method: 'Login',
    seq: 1,
    body,
    token: 'tok',
  });
  const parsed = parseFrame(frame);
  assert.strictEqual(parsed.meta.service_name, 'gamepb.userpb.UserService');
  assert.strictEqual(parsed.meta.method_name, 'Login');
  assert.strictEqual(Number(parsed.meta.message_type), MESSAGE_TYPE.REQUEST);
  assert.strictEqual(Number(parsed.meta.client_seq), 1);
  assert.deepStrictEqual(Array.from(parsed.body), [9, 8, 7]);
  assert.strictEqual(parsed.token, 'tok');
});

test('aes-gcm body uses nonce||ciphertext||tag layout and binds seq as aad', async () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const nonce = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i);
  const plain = Uint8Array.from(Buffer.from('{"hello":"farm"}', 'utf8'));

  const encrypted = await encryptBody(plain, key, nonce, 7);
  assert.deepStrictEqual(Array.from(encrypted.subarray(0, 12)), Array.from(nonce));
  assert.strictEqual(encrypted.length, 12 + plain.length + 16);

  const decrypted = await decryptBody(encrypted, key, 7);
  assert.deepStrictEqual(Array.from(decrypted), Array.from(plain));

  await assert.rejects(() => decryptBody(encrypted, key, 8), /operation failed|decrypt/i);
});

test('seqToAad is 4-byte big endian', () => {
  assert.deepStrictEqual(Array.from(seqToAad(0x01020304)), [1, 2, 3, 4]);
});

test('request encode/decode uses recovered rpc map', () => {
  const req = encodeRequest('gamepb.taskpb.TaskService', 'TaskInfo', { global_scene_id: 42 });
  const parsed = decodeMessage(services['gamepb.taskpb.TaskService'].TaskInfo[0], req, registry);
  assert.strictEqual(parsed.global_scene_id, 42);

  const reply = encodeMessage('taskpb.TaskInfoReply', {
    task_info: { daily_tasks: [{ id: 11, progress: 2, is_claimed: false, task_type: 3 }] },
  }, registry);
  const decoded = decodeResponse('gamepb.taskpb.TaskService', 'TaskInfo', reply);
  assert.strictEqual(decoded.task_info.daily_tasks[0].id, 11);
  assert.strictEqual(decoded.task_info.daily_tasks[0].task_type, 3);
});

test('farm client correlates responses by client_seq', async () => {
  const transport = {
    sent: [],
    send(bytes) { this.sent.push(bytes); },
    onMessage(cb) { this.deliver = cb; },
    onClose(cb) { this.closeCb = cb; },
  };
  const client = new FarmClient({ transport, tokenFactory: () => 'fixed-token' });
  const pending = client.request('gamepb.userpb.UserService', 'Heartbeat', Uint8Array.of(1, 2));

  const outbound = parseFrame(transport.sent[0]);
  assert.strictEqual(Number(outbound.meta.client_seq), 1);
  assert.strictEqual(outbound.token, 'fixed-token');

  const replyBody = encodeMessage('userpb.HeartbeatReply', { time_now_millis: 123 }, registry);
  const reply = buildFrame({
    service: 'gamepb.userpb.UserService',
    method: 'Heartbeat',
    messageType: MESSAGE_TYPE.RESPONSE,
    seq: 1,
    body: replyBody,
    token: '',
  });
  transport.deliver(reply);

  const result = await pending;
  assert.strictEqual(Number(result.meta.message_type), MESSAGE_TYPE.RESPONSE);
  const decoded = decodeResponse('gamepb.userpb.UserService', 'Heartbeat', result.body);
  assert.strictEqual(decoded.time_now_millis, 123);
});

test('randomToken matches observed 65..128 length range', () => {
  for (let i = 0; i < 32; i++) {
    const t = randomToken();
    assert.ok(t.length >= 65 && t.length <= 128, 'length ' + t.length);
    assert.ok(t.endsWith('='));
  }
});
