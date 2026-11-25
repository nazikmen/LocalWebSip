# LocalWebSip

LocalWebSip is intended to let a website control a local Windows SIP phone
without sending SIP or audio through the browser.

**Current status: development mock only.** There is no SIP, RTP, audio,
recording, Windows desktop app, installer or secure site pairing. Do not use
real SIP credentials or deploy this mock on untrusted sites. Mock state exists
only while its Native Messaging host is running, so it does not meet the
production requirement that calls survive browser disconnection.

The prototype has no external package dependencies. Node.js 20+ runs the mock
and its tests:

```sh
npm test
```

For the browser development setup see [demo/README.md](demo/README.md).
The Windows registration script is experimental and requires a separately
installed Node.js; it is not an installer and has not been validated on
Windows. [Architecture and threat boundaries](docs/architecture.md) and
[the mock protocol](protocol/README.md) describe the limitations. The
provisional request schema is in [protocol/request.schema.json](protocol/request.schema.json).

Production work still required includes authenticated per-user IPC and site
pairing, DPAPI, actual SIP and media, durable history and recording with
explicit consent, reconnect, Windows UI and installation/update/uninstall,
complete protocol schemas, and security and Windows end-to-end testing.
PJSIP is only a candidate, not an included dependency.

Distributed under GPL-2.0-only; see [LICENSE](LICENSE), [COPYING](COPYING),
and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Source is available
in this repository.
