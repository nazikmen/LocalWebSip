'use strict';

const MAX_FRAME = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

function encode(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FRAME) throw new Error('Frame too large');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

class FrameReader {
  constructor(onMessage) {
    this.buffer = Buffer.alloc(0);
    this.onMessage = onMessage;
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_FRAME) throw new Error('Invalid frame length');
      if (this.buffer.length < length + 4) return;
      const payload = this.buffer.subarray(4, length + 4);
      this.buffer = this.buffer.subarray(length + 4);
      this.onMessage(JSON.parse(decoder.decode(payload)));
    }
  }

  end() {
    if (this.buffer.length) throw new Error('Truncated frame');
  }
}

module.exports = { encode, FrameReader, MAX_FRAME };
