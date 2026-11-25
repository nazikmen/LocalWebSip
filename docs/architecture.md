# Architecture decision record: development mock

Status: provisional. This repository currently contains a mock, not a SIP
phone. Do not use it with real credentials, calls, or recordings.

The intended production architecture is a web SDK, an origin-restricted
browser extension, a Native Messaging host and an independently running
Windows application. The application must own SIP and RTP so that an active
call survives a browser or page closing. IPC must be authenticated and
restricted to the current user; it must not expose a public TCP port. Site
pairing and user consent are required before privileged operations.

The initial development implementation uses Node.js standard libraries, a
Manifest V3 extension and framework-independent JavaScript. The mock engine is
currently hosted inside the Native Messaging process. Its state is volatile
and does **not** survive that process exiting; it has no audio or SIP. This
is a deliberate limitation, not the production IPC design. It rejects
credentials and has no access to arbitrary files.

The browser is an untrusted boundary: a site's JavaScript, including any
injected script, can send messages as that site. An extension allowlist alone
is not pairing or authorization. The current mock must not be used to protect
real accounts. Production needs explicit application-side pairing, consent,
schema validation, rate limits, secure IPC, DPAPI, and explicit recording
release before any sensitive functionality is enabled.

PJSIP is a candidate for a future engine, not a dependency of this mock.
Its exact version, licenses, build options and all transitive dependencies
must be reviewed for GPL-2.0 compatibility before it is added. No such review
or Windows interoperability testing has yet been completed.
