'use strict';

const { MockEngine } = require('../desktop/mock-engine');
const { encode, FrameReader } = require('./framing');

const send = message => process.stdout.write(encode(message));
const engine = new MockEngine(send);
const reader = new FrameReader(request => send(engine.execute(request)));

process.stdin.on('data', chunk => {
  try {
    reader.push(chunk);
  } catch {
    process.stderr.write('Invalid Native Messaging frame\n');
    process.exitCode = 1;
    process.stdin.destroy();
  }
});
process.stdin.on('end', () => {
  try {
    reader.end();
  } catch {
    process.stderr.write('Truncated Native Messaging frame\n');
    process.exitCode = 1;
  }
});
