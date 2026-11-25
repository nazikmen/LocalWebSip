"use strict";
const origins = document.getElementById("origins");
const status = document.getElementById("status");
chrome.storage.local.get("allowedOrigins").then(({ allowedOrigins = [] }) => {
  origins.value = Array.isArray(allowedOrigins) ? allowedOrigins.join("\n") : "";
});
document.getElementById("save").addEventListener("click", async () => {
  const values = origins.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.origin !== value) throw new Error();
    } catch (_) {
      status.textContent = "Invalid origin: " + value + ". Use an exact HTTPS origin without a path or trailing slash.";
      return;
    }
  }
  await chrome.storage.local.set({ allowedOrigins: [...new Set(values)] });
  status.textContent = "Saved.";
});
