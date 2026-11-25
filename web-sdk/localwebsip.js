(function (root) {
  "use strict";
  const VERSION = "1";
  const MAX_BYTES = 16384;
  const CHANNEL = "localwebsip";

  class LocalWebSipError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "LocalWebSipError";
      this.code = code;
    }
  }

  class LocalWebSip {
    constructor(options = {}) {
      if (root !== root.top || root.location.protocol !== "https:") {
        throw new LocalWebSipError("UNSUPPORTED_CONTEXT", "An HTTPS top-level page is required");
      }
      this.origin = root.location.origin;
      this.timeout = options.timeout === undefined ? 20000 : options.timeout;
      if (!Number.isFinite(this.timeout) || this.timeout <= 0) throw new TypeError("timeout must be positive");
      this.pending = new Map();
      this.listeners = new Set();
      this.closed = false;
      this.onMessage = (event) => {
        if (event.source !== root || event.origin !== this.origin || !event.data ||
            event.data.channel !== CHANNEL || event.data.direction !== "extension-to-page") return;
        const payload = event.data.payload;
        if (!payload || payload.version !== VERSION || !this.bounded(payload)) return;
        if (typeof payload.event === "string" && typeof payload.eventId === "string" &&
            payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
          for (const listener of this.listeners) {
            try { listener(payload); } catch (_) { /* isolate subscribers */ }
          }
          return;
        }
        const entry = this.pending.get(payload.id);
        if (!entry) return;
        if (payload.error && typeof payload.error.code === "string" && typeof payload.error.message === "string") {
          this.pending.delete(payload.id);
          clearTimeout(entry.timer);
          entry.reject(new LocalWebSipError(payload.error.code, payload.error.message));
        } else if (payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)) {
          this.pending.delete(payload.id);
          clearTimeout(entry.timer);
          entry.resolve(payload.result);
        }
      };
      root.addEventListener("message", this.onMessage);
    }
    bounded(value) {
      try { return new TextEncoder().encode(JSON.stringify(value)).length <= MAX_BYTES; }
      catch (_) { return false; }
    }
    request(command, params = {}) {
      if (this.closed) return Promise.reject(new LocalWebSipError("CLOSED", "SDK is closed"));
      if (typeof command !== "string" || !params || typeof params !== "object" || Array.isArray(params)) {
        return Promise.reject(new LocalWebSipError("INVALID_REQUEST", "Invalid request"));
      }
      const id = root.crypto.randomUUID();
      const payload = { id, version: VERSION, command, params };
      if (!this.bounded(payload)) return Promise.reject(new LocalWebSipError("INVALID_REQUEST", "Request is too large"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new LocalWebSipError("TIMEOUT", "Extension did not respond"));
        }, this.timeout);
        this.pending.set(id, { resolve, reject, timer });
        root.postMessage({ channel: CHANNEL, direction: "page-to-extension", payload }, this.origin);
      });
    }
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      root.removeEventListener("message", this.onMessage);
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new LocalWebSipError("CLOSED", "SDK is closed"));
      }
      this.pending.clear();
      this.listeners.clear();
    }
    getInfo() { return this.request("getInfo"); }
    getStatus() { return this.request("getStatus"); }
    configureAccount(accountId, displayName) {
      return this.request("configureAccount", displayName === undefined ? { accountId } : { accountId, displayName });
    }
    selectAccount(accountId) { return this.request("selectAccount", { accountId }); }
    register() { return this.request("register"); }
    unregister() { return this.request("unregister"); }
    dial(number) { return this.request("dial", { number }); }
    answer() { return this.request("answer"); }
    hangup() { return this.request("hangup"); }
    reject() { return this.request("reject"); }
    mute(enabled) { return this.request("mute", { enabled }); }
    hold(enabled) { return this.request("hold", { enabled }); }
    getCallState() { return this.request("getCallState"); }
    getCallHistory() { return this.request("getCallHistory"); }
  }
  root.LocalWebSip = LocalWebSip;
  root.LocalWebSipError = LocalWebSipError;
})(window);
