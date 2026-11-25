"use strict";

if (window === window.top && location.protocol === "https:") {
  const origin = location.origin;
  const port = chrome.runtime.connect({ name: "localwebsip" });
  const maxBytes = 16384;
  function bounded(value) {
    try { return new TextEncoder().encode(JSON.stringify(value)).length <= maxBytes; }
    catch (_) { return false; }
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== origin || !bounded(event.data) ||
        !event.data || event.data.channel !== "localwebsip" ||
        event.data.direction !== "page-to-extension" || !event.data.payload) return;
    try { port.postMessage(event.data.payload); } catch (_) { /* extension was disconnected */ }
  });
  port.onMessage.addListener((payload) => {
    if (bounded(payload)) window.postMessage({
      channel: "localwebsip", direction: "extension-to-page", payload
    }, origin);
  });
}
