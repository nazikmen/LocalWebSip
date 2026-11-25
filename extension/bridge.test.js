"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function signal() {
  const listeners = [];
  return { addListener: (fn) => listeners.push(fn), emit: (...args) => Promise.all(listeners.map((fn) => fn(...args))) };
}
function port(sender) {
  return {
    name: "localwebsip", sender, onMessage: signal(), onDisconnect: signal(), sent: [],
    postMessage(message) { this.sent.push(message); },
    disconnect() { this.disconnected = true; return this.onDisconnect.emit(); }
  };
}
function setup() {
  const onConnect = signal();
  const natives = [];
  const state = { allowedOrigins: [] };
  const chrome = {
    storage: { local: { get: async () => ({ allowedOrigins: state.allowedOrigins }) } },
    runtime: {
      onConnect,
      connectNative(name) {
        assert.equal(name, "com.localwebsip.mock");
        const native = port();
        natives.push(native);
        return native;
      }
    }
  };
  vm.runInNewContext(fs.readFileSync("extension/background.js", "utf8"), {
    chrome, URL, TextEncoder, crypto: webcrypto, setTimeout, clearTimeout
  });
  return { onConnect, natives, state };
}
function page(origin = "https://a.example", frameId = 0) {
  return port({ url: origin + "/page", origin, tab: { id: 1 }, frameId });
}
function request(command, params = {}, id = "page-id") {
  return { id, version: "1", command, params };
}

test("default deny, exact origin and top frame", async () => {
  const env = setup();
  const p = page();
  await env.onConnect.emit(p);
  await p.onMessage.emit(request("getInfo"));
  assert.equal(p.sent[0].error.code, "ORIGIN_DENIED");
  assert.equal(env.natives.length, 0);
  const iframe = page("https://a.example", 1);
  await env.onConnect.emit(iframe);
  assert.equal(iframe.disconnected, true);
  const http = page("http://a.example");
  await env.onConnect.emit(http);
  assert.equal(http.disconnected, true);
  const forged = page();
  forged.sender.origin = "https://b.example";
  await env.onConnect.emit(forged);
  assert.equal(forged.disconnected, true);
});

test("commands are strictly validated, correlated and scoped per connection", async () => {
  const env = setup();
  env.state.allowedOrigins = ["https://a.example", "https://b.example"];
  const a = page();
  const b = page("https://b.example");
  await env.onConnect.emit(a);
  await env.onConnect.emit(b);
  for (const bad of [
    request("configureAccount", { accountId: "fake", displayName: "Demo", password: "secret" }),
    request("configureAccount", { accountId: "fake", displayName: "Demo", credentials: {} }),
    request("dial", { number: "555", extra: true }),
    request("unknown"),
    request("mute", { enabled: "true" })
  ]) await a.onMessage.emit(bad);
  assert.equal(a.sent.length, 5);
  assert.ok(a.sent.every((message) => message.error.code === "INVALID_REQUEST"));
  assert.equal(env.natives.length, 0);
  await a.onMessage.emit(request("configureAccount", { accountId: "fake", displayName: "Demo" }, "one"));
  await b.onMessage.emit(request("getInfo", {}, "two"));
  const [na, nb] = env.natives;
  assert.notEqual(na.sent[0].id, "one");
  await na.onMessage.emit({ id: na.sent[0].id, version: "1", result: { ok: true } });
  assert.equal(a.sent.at(-1).id, "one");
  assert.equal(b.sent.length, 0);
  await na.onMessage.emit({ event: "call", eventId: "e1", version: "1", data: {} });
  assert.equal(a.sent.at(-1).eventId, "e1");
  assert.equal(b.sent.length, 0);
  env.state.allowedOrigins = ["https://b.example"];
  const count = a.sent.length;
  await na.onMessage.emit({ event: "call", eventId: "e2", version: "1", data: {} });
  assert.equal(a.sent.length, count);
  await nb.onMessage.emit({ id: nb.sent[0].id, version: "1", result: {} });
  assert.equal(b.sent.at(-1).id, "two");
  await a.disconnect();
  await b.disconnect();
});

test("disconnect reports host unavailable and revocation suppresses replies", async () => {
  const env = setup();
  env.state.allowedOrigins = ["https://a.example"];
  const p = page();
  await env.onConnect.emit(p);
  await p.onMessage.emit(request("getStatus"));
  await env.natives[0].disconnect();
  assert.equal(p.sent.at(-1).error.code, "HOST_UNAVAILABLE");
  await p.onMessage.emit(request("getInfo", {}, "second"));
  const native = env.natives[1];
  env.state.allowedOrigins = [];
  await native.onMessage.emit({ id: native.sent[0].id, version: "1", result: { ok: true } });
  assert.equal(p.sent.at(-1).error.code, "ORIGIN_DENIED");
  await p.disconnect();
});

test("SDK correlates promises, scopes messages, unsubscribes and times out", async () => {
  const callbacks = new Set();
  const sent = [];
  const win = {
    location: { origin: "https://a.example", protocol: "https:" },
    crypto: webcrypto,
    addEventListener: (_, fn) => callbacks.add(fn),
    removeEventListener: (_, fn) => callbacks.delete(fn),
    postMessage: (message, origin) => sent.push({ message, origin })
  };
  win.top = win;
  vm.runInNewContext(fs.readFileSync("web-sdk/localwebsip.js", "utf8"), {
    window: win, TextEncoder, setTimeout, clearTimeout
  });
  const sip = new win.LocalWebSip({ timeout: 20 });
  const pending = sip.dial("555");
  assert.equal(sent[0].origin, "https://a.example");
  assert.equal(sent[0].message.direction, "page-to-extension");
  const deliver = (payload, origin = win.location.origin, source = win) => {
    for (const fn of callbacks) fn({ source, origin, data: { channel: "localwebsip", direction: "extension-to-page", payload } });
  };
  const response = { id: sent[0].message.payload.id, version: "1", result: { ok: true } };
  deliver(response, "https://b.example");
  assert.equal(sip.pending.size, 1);
  deliver(response);
  assert.equal((await pending).ok, true);
  let events = 0;
  const unsubscribe = sip.subscribe(() => events++);
  deliver({ event: "call", version: "1", eventId: "e", data: {} });
  unsubscribe();
  deliver({ event: "call", version: "1", eventId: "e2", data: {} });
  assert.equal(events, 1);
  await assert.rejects(sip.getInfo(), (error) => error.code === "TIMEOUT");
  sip.close();
  assert.equal(callbacks.size, 0);
  win.top = {};
  assert.throws(() => new win.LocalWebSip(), (error) => error.code === "UNSUPPORTED_CONTEXT");
});
