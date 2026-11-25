'use strict';

const { randomUUID } = require('node:crypto');

class MockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function assert(condition, code, message) {
  if (!condition) throw new MockError(code, message);
}

function object(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_REQUEST', 'Expected an object');
  assert(Object.keys(value).every(key => keys.includes(key)), 'INVALID_REQUEST', 'Unexpected field');
}

function text(value, field, max = 128) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'INVALID_REQUEST', `Invalid ${field}`);
}

class MockEngine {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.accounts = new Map();
    this.activeAccountId = null;
    this.call = null;
    this.history = [];
  }

  event(event, data) {
    this.emit({ version: '1', event, eventId: randomUUID(), data });
  }

  execute(request) {
    try {
      object(request, ['id', 'version', 'command', 'params']);
      text(request.id, 'id');
      assert(request.version === '1', 'UNSUPPORTED_VERSION', 'Unsupported protocol version');
      text(request.command, 'command');
      object(request.params, this.paramKeys(request.command));
      const result = this.run(request.command, request.params);
      return { id: request.id, version: '1', result };
    } catch (error) {
      return {
        id: typeof request?.id === 'string' && request.id.length <= 128 ? request.id : '',
        version: '1',
        error: { code: error instanceof MockError ? error.code : 'INTERNAL_ERROR', message: error instanceof MockError ? error.message : 'Internal error' }
      };
    }
  }

  paramKeys(command) {
    const keys = {
      getInfo: [], getStatus: [], configureAccount: ['accountId', 'displayName'],
      selectAccount: ['accountId'], register: [], unregister: [], dial: ['number'],
      answer: [], hangup: [], reject: [], mute: ['enabled'], hold: ['enabled'],
      getCallState: [], getCallHistory: []
    };
    assert(Object.hasOwn(keys, command), 'UNKNOWN_COMMAND', 'Command is not supported by the mock');
    return keys[command];
  }

  status() {
    return {
      accounts: [...this.accounts.values()].map(account => ({ ...account })),
      activeAccountId: this.activeAccountId,
      call: this.call ? { ...this.call } : null
    };
  }

  currentAccount() {
    const account = this.accounts.get(this.activeAccountId);
    assert(account, 'NO_ACCOUNT', 'Select a mock account first');
    return account;
  }

  activeCall() {
    assert(this.call, 'NO_ACTIVE_CALL', 'There is no active call');
    return this.call;
  }

  run(command, params) {
    switch (command) {
      case 'getInfo':
        return { name: 'LocalWebSip mock', appVersion: '0.1.0', protocolVersion: '1', mock: true };
      case 'getStatus':
        return this.status();
      case 'configureAccount': {
        text(params.accountId, 'accountId');
        if (params.displayName !== undefined) text(params.displayName, 'displayName');
        assert(this.accounts.size < 100 || this.accounts.has(params.accountId), 'LIMIT_EXCEEDED', 'Too many accounts');
        const previous = this.accounts.get(params.accountId);
        const account = { accountId: params.accountId, displayName: params.displayName || params.accountId, registered: previous?.registered || false };
        this.accounts.set(account.accountId, account);
        if (!this.activeAccountId) this.activeAccountId = account.accountId;
        return { ...account };
      }
      case 'selectAccount':
        text(params.accountId, 'accountId');
        assert(this.accounts.has(params.accountId), 'NO_ACCOUNT', 'Unknown account');
        this.activeAccountId = params.accountId;
        return this.status();
      case 'register': {
        const account = this.currentAccount();
        this.event('account.registering', { accountId: account.accountId });
        account.registered = true;
        this.event('account.registered', { accountId: account.accountId });
        return { ...account };
      }
      case 'unregister': {
        const account = this.currentAccount();
        account.registered = false;
        this.event('account.unregistered', { accountId: account.accountId });
        return { ...account };
      }
      case 'dial': {
        text(params.number, 'number', 64);
        assert(/^[+0-9*#-]+$/.test(params.number), 'INVALID_REQUEST', 'Invalid mock number');
        const account = this.currentAccount();
        assert(account.registered, 'NOT_REGISTERED', 'Mock account is not registered');
        assert(!this.call, 'CALL_ACTIVE', 'A call is already active');
        this.call = {
          callId: randomUUID(), direction: 'outgoing', accountId: account.accountId,
          accountName: account.displayName, originalNumber: params.number,
          normalizedNumber: params.number.replace(/-/g, ''), initiatedAt: new Date().toISOString(),
          answeredAt: null, endedAt: null, durationSeconds: 0, state: 'ringing',
          endReason: null, sipCode: null, recordingId: null, recordingAvailable: false,
          recordingLocator: null, protocolVersion: '1', muted: false, held: false
        };
        this.event('call.initiating', { ...this.call, state: 'initiating' });
        this.event('call.ringing', { ...this.call });
        return { ...this.call };
      }
      case 'answer': {
        const call = this.activeCall();
        assert(call.state === 'ringing', 'INVALID_STATE', 'Call is not ringing');
        call.state = 'answered';
        call.answeredAt = new Date().toISOString();
        this.event('call.answered', { ...call });
        return { ...call };
      }
      case 'hangup':
      case 'reject': {
        const call = this.activeCall();
        if (command === 'reject') assert(call.state === 'ringing', 'INVALID_STATE', 'Call is not ringing');
        call.endedAt = new Date().toISOString();
        call.durationSeconds = call.answeredAt ? Math.max(0, Math.floor((Date.parse(call.endedAt) - Date.parse(call.answeredAt)) / 1000)) : 0;
        call.state = 'ended';
        call.endReason = command === 'reject' ? 'rejected' : 'hangup';
        this.history.unshift({ ...call });
        if (this.history.length > 100) this.history.pop();
        this.call = null;
        this.event('call.ended', { ...call });
        return { ...call };
      }
      case 'mute':
      case 'hold': {
        assert(typeof params.enabled === 'boolean', 'INVALID_REQUEST', 'enabled must be a boolean');
        const call = this.activeCall();
        assert(call.answeredAt, 'INVALID_STATE', 'Call is not answered');
        if (command === 'mute') {
          call.muted = params.enabled;
          this.event('call.muted', { ...call });
        } else {
          call.held = params.enabled;
          call.state = params.enabled ? 'held' : 'answered';
          this.event(params.enabled ? 'call.held' : 'call.resumed', { ...call });
        }
        return { ...call };
      }
      case 'getCallState':
        return { call: this.call ? { ...this.call } : null };
      case 'getCallHistory':
        return { calls: this.history.map(call => ({ ...call })) };
    }
  }
}

module.exports = { MockEngine };
