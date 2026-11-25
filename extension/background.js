"use strict";

const HOST = "com.localwebsip.mock";
const VERSION = "1";
const MAX_BYTES = 16384;
const MAX_PENDING = 32;
const TIMEOUT = 15000;
const EMPTY_COMMANDS = new Set([
  "getInfo", "getStatus", "register", "unregister", "answer", "hangup",
  "reject", "getCallState", "getCallHistory"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bounded(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= MAX_BYTES;
  } catch (_) {
    return false;
  }
}

function validParams(command, params) {
  if (!isObject(params)) return false;
  const keys = Object.keys(params).sort();
  if (EMPTY_COMMANDS.has(command)) return keys.length === 0;
  if (command === "configureAccount") {
    return (keys.join(",") === "accountId" || keys.join(",") === "accountId,displayName") &&
      typeof params.accountId === "string" && /\S/.test(params.accountId) && params.accountId.length <= 128 &&
      (params.displayName === undefined || (typeof params.displayName === "string" &&
        /\S/.test(params.displayName) && params.displayName.length <= 128));
  }
  if (command === "selectAccount") {
    return keys.join(",") === "accountId" && typeof params.accountId === "string" &&
      /\S/.test(params.accountId) && params.accountId.length <= 128;
  }
  if (command === "dial") {
    return keys.join(",") === "number" && typeof params.number === "string" &&
      /^[+0-9*#-]{1,64}$/.test(params.number);
  }
  if (command === "mute" || command === "hold") {
    return keys.join(",") === "enabled" && typeof params.enabled === "boolean";
  }
  return false;
}

function exactHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch (_) {
    return false;
  }
}

async function authorized(origin) {
  const { allowedOrigins = [] } = await chrome.storage.local.get("allowedOrigins");
  return Array.isArray(allowedOrigins) && allowedOrigins.includes(origin);
}

chrome.runtime.onConnect.addListener((page) => {
  const sender = page.sender;
  let origin;
  try {
    origin = new URL(sender.url).origin;
  } catch (_) {
    page.disconnect();
    return;
  }
  if (page.name !== "localwebsip" || !sender.tab || sender.frameId !== 0 ||
      !exactHttpsOrigin(origin) || (sender.origin && sender.origin !== origin)) {
    page.disconnect();
    return;
  }

  let native = null;
  let closed = false;
  const pending = new Map();
  function send(message) {
    if (!closed) {
      try { page.postMessage(message); } catch (_) { /* page disconnected */ }
    }
  }
  function failAll(code, message) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      send({ id: entry.pageId, version: VERSION, error: { code, message } });
      pending.delete(id);
    }
  }
  function connectNative() {
    if (native) return native;
    const port = chrome.runtime.connectNative(HOST);
    native = port;
    port.onMessage.addListener(async (message) => {
      if (closed || native !== port || !isObject(message) ||
          message.version !== VERSION) return;
      if (!bounded(message)) {
        const entry = pending.get(message.id);
        if (entry) {
          pending.delete(message.id);
          clearTimeout(entry.timer);
          send({ id: entry.pageId, version: VERSION, error: { code: "INVALID_RESPONSE", message: "Native response exceeds size limit" } });
        }
        return;
      }
      if (typeof message.event === "string" && message.event.length <= 128 &&
          typeof message.eventId === "string" && message.eventId.length <= 128 &&
          isObject(message.data)) {
        if (await authorized(origin) && !closed && native === port) {
          send({ event: message.event, version: VERSION, eventId: message.eventId, data: message.data });
        }
        return;
      }
      if (typeof message.id !== "string" || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (!await authorized(origin)) {
        send({ id: entry.pageId, version: VERSION, error: { code: "ORIGIN_DENIED", message: "Origin is not allowed" } });
      } else if (isObject(message.result) && message.error === undefined) {
        send({ id: entry.pageId, version: VERSION, result: message.result });
      } else if (isObject(message.error) && typeof message.error.code === "string" &&
                 typeof message.error.message === "string" && message.result === undefined) {
        send({ id: entry.pageId, version: VERSION, error: { code: message.error.code, message: message.error.message } });
      } else {
        send({ id: entry.pageId, version: VERSION, error: { code: "INVALID_RESPONSE", message: "Invalid native response" } });
      }
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (native === port) {
        native = null;
        failAll("HOST_UNAVAILABLE", "Mock native host is unavailable or disconnected");
      }
    });
    return port;
  }
  page.onMessage.addListener(async (request) => {
    if (!isObject(request) || !bounded(request) || typeof request.id !== "string" ||
        !request.id || request.id.length > 128 || request.version !== VERSION ||
        typeof request.command !== "string") return;
    if (!validParams(request.command, request.params)) {
      send({ id: request.id, version: VERSION, error: { code: "INVALID_REQUEST", message: "Unsupported command or parameters" } });
      return;
    }
    let nativeId;
    try {
      if (!await authorized(origin)) {
        send({ id: request.id, version: VERSION, error: { code: "ORIGIN_DENIED", message: "Origin is not allowed" } });
        return;
      }
      if (closed) return;
      if (pending.size >= MAX_PENDING) {
        send({ id: request.id, version: VERSION, error: { code: "BUSY", message: "Too many pending requests" } });
        return;
      }
      const id = crypto.randomUUID();
      nativeId = id;
      const timer = setTimeout(() => {
        pending.delete(id);
        send({ id: request.id, version: VERSION, error: { code: "HOST_TIMEOUT", message: "Mock native host did not respond" } });
      }, TIMEOUT);
      pending.set(id, { pageId: request.id, timer });
      connectNative().postMessage({ id, version: VERSION, command: request.command, params: request.params });
    } catch (_) {
      const hadPending = nativeId && pending.has(nativeId);
      failAll("HOST_UNAVAILABLE", "Mock native host is unavailable or disconnected");
      if (!hadPending) send({ id: request.id, version: VERSION, error: { code: "HOST_UNAVAILABLE", message: "Mock native host is unavailable or disconnected" } });
    }
  });
  page.onDisconnect.addListener(() => {
    closed = true;
    failAll("DISCONNECTED", "Page disconnected");
    if (native) native.disconnect();
    native = null;
  });
});
