# Development-only browser mock

This is a mock integration: it does not make SIP calls. It is not paired or
secure for production, and mock accounts, calls, and history are not persistent.
Use fake identifiers and numbers only; never enter credentials. Any script on
an allowed origin can issue requests or forge page messages. The allowlist is
not a security boundary against scripts running on that origin.

1. Load `extension/` as an unpacked Manifest V3 extension in Chrome or Edge and
   copy its extension ID. The development host requires Node.js.
2. On Windows, from the repository root in PowerShell, register the mock host
   for that ID using `.\scripts\register-mock-host.ps1 -ExtensionId <extension-id>`.
   The script registers `com.localwebsip.mock` for the current user in Chrome
   and Edge. On other platforms, register the native-host manifest and launcher
   manually for your browser, allowing the extension ID. This directory does
   not install the host.
3. In the extension options, add the exact HTTPS origin hosting the demo, e.g.
   `https://localhost:8443`. The list starts empty. Include a non-default port,
   but no path or trailing slash.
4. Serve the repository over HTTPS with a locally trusted development
   certificate, then open `https://localhost:8443/demo/` as a top-level page.
   Do not use `file:`, HTTP, or an iframe. This project does not supply an HTTPS
   server or certificate. The SDK script must be served from `web-sdk/`.
5. Configure the fake account, register, and try the other buttons. The first
   configured account becomes selected. Events and
   responses appear in the page. A missing/disconnected host gives
   `HOST_UNAVAILABLE`; an absent extension gives an SDK `TIMEOUT`.

The bridge accepts only the documented commands and exact parameters; account
configuration accepts only `accountId` and optional `displayName`, not passwords or
other credentials. Origin changes in options apply to subsequent messages and
events. Each page connects separately to the host; host lifetime and state
follow that native connection, not persistent storage. Messages are limited to
16 KiB; large history responses can therefore fail with `INVALID_RESPONSE`.

SDK usage:

```html
<script src="/web-sdk/localwebsip.js"></script>
<script>
  const sip = new LocalWebSip({ timeout: 20000 });
  const unsubscribe = sip.subscribe(event => console.log(event));
  sip.getInfo().then(console.log).catch(console.error);
  // Later: unsubscribe(); sip.close();
</script>
```

`request(command, params)` is also available; the extension rejects unknown
commands or extra parameters. SDK calls return promises. Events have
`event`, `version`, `eventId`, and `data`. Responses and event contents depend
on the installed mock host.
