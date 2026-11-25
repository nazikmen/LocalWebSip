# Mock protocol version 1

This is a development subset, not the final public SIP API. JSON objects
travel over the Chrome/Edge Native Messaging framing (four-byte little-endian
length, followed by UTF-8 JSON). Frames over 1 MiB are rejected. Requests
have `id`, `version` (`"1"`), `command`, and `params`; responses echo the ID
and contain either `result` or `error` (`code`, `message`). Events carry
`event`, `eventId`, `version`, and `data`. A single host process emits unique
event identifiers for deduplication.

Supported commands are `getInfo`, `getStatus`, `configureAccount`,
`selectAccount`, `register`, `unregister`, `dial`, `answer`, `hangup`,
`reject`, `mute`, `hold`, `getCallState`, and `getCallHistory`. Unsupported
commands fail with `UNKNOWN_COMMAND`. `configureAccount` accepts only
`accountId` and optional `displayName`; real credentials, provisioning tokens,
and other SIP settings are rejected. `dial` accepts a mock number only.
Events and history contain no credentials.

Calls are simulated, and registration does not contact a server. A single
active call is permitted. Ending it adds an in-memory history entry; all state
is lost on host exit. No recording is made. Neither the mock wire format nor
its API should be considered stable until the full public schema, security
model and compatibility rules are specified.
