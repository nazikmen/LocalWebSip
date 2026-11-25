'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { MockEngine } = require('../desktop/mock-engine');
const { encode, FrameReader, MAX_FRAME } = require('../native-host/framing');

function request(engine, command, params = {}, version = '1') {
  return engine.execute({ id: 'test', version, command, params });
}

test('mock call lifecycle emits events and saves credential-free history', () => {
  const events = [];
  const engine = new MockEngine(event => events.push(event));
  assert.equal(request(engine, 'configureAccount', { accountId: 'demo', displayName: 'Demo' }).result.accountId, 'demo');
  request(engine, 'register');
  const call = request(engine, 'dial', { number: '+12-34' }).result;
  assert.equal(call.normalizedNumber, '+1234');
  assert.equal(request(engine, 'dial', { number: '9' }).error.code, 'CALL_ACTIVE');
  assert.equal(request(engine, 'answer').result.state, 'answered');
  assert.equal(request(engine, 'hold', { enabled: true }).result.state, 'held');
  assert.equal(request(engine, 'hold', { enabled: false }).result.state, 'answered');
  assert.equal(request(engine, 'mute', { enabled: true }).result.muted, true);
  assert.equal(request(engine, 'hangup').result.state, 'ended');
  assert.equal(request(engine, 'getCallHistory').result.calls[0].callId, call.callId);
  assert.equal(request(engine, 'getCallState').result.call, null);
  assert.deepEqual(events.map(event => event.event), [
    'account.registering', 'account.registered', 'call.initiating', 'call.ringing',
    'call.answered', 'call.held', 'call.resumed', 'call.muted', 'call.ended'
  ]);
  assert.equal(new Set(events.map(event => event.eventId)).size, events.length);
});

test('mock rejects credentials, unknown fields, wrong versions and invalid transitions', () => {
  const engine = new MockEngine();
  assert.equal(request(engine, 'configureAccount', { accountId: 'a', password: 'not-a-real-password' }).error.code, 'INVALID_REQUEST');
  assert.deepEqual(request(engine, 'getStatus').result.accounts, []);
  assert.equal(request(engine, 'getInfo', {}, '2').error.code, 'UNSUPPORTED_VERSION');
  assert.equal(request(engine, 'getRecording').error.code, 'UNKNOWN_COMMAND');
  assert.equal(request(engine, 'hangup').error.code, 'NO_ACTIVE_CALL');
  assert.equal(request(engine, 'dial', { number: '123' }).error.code, 'NO_ACCOUNT');
  request(engine, 'configureAccount', { accountId: 'a' });
  assert.equal(request(engine, 'dial', { number: '123' }).error.code, 'NOT_REGISTERED');
});

test('framing handles split and concatenated messages and rejects invalid input', () => {
  const messages = [];
  const reader = new FrameReader(message => messages.push(message));
  const bytes = Buffer.concat([encode({ value: 'Привет' }), encode({ value: 2 })]);
  for (const byte of bytes) reader.push(Buffer.from([byte]));
  reader.end();
  assert.deepEqual(messages, [{ value: 'Привет' }, { value: 2 }]);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(MAX_FRAME + 1);
  assert.throws(() => new FrameReader(() => {}).push(header), /length/);
  const partial = new FrameReader(() => {});
  partial.push(Buffer.from([1, 0]));
  assert.throws(() => partial.end(), /Truncated/);
  assert.throws(() => new FrameReader(() => {}).push(Buffer.from([1, 0, 0, 0, 0xff])));
});

test('host exchanges framed messages over stdio', async () => {
  const child = spawn(process.execPath, ['native-host/host.js'], { cwd: require('node:path').join(__dirname, '..') });
  const received = [];
  const reader = new FrameReader(message => received.push(message));
  child.stdout.on('data', chunk => reader.push(chunk));
  child.stdin.end(encode({ id: 'hello', version: '1', command: 'getInfo', params: {} }));
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 0);
  assert.equal(received[0].id, 'hello');
  assert.equal(received[0].result.mock, true);
});
