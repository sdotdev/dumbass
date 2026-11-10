# Privacy and redaction

Use only the information needed for the task. Do not repeat sensitive details in jokes, examples, summaries, or reports when a generic description will do. Treat credentials, authentication tokens, financial details, health information, precise location, and identifying information as sensitive.

## Handling data

- Do not ask for secrets unless the task truly requires them; prefer a safe local procedure or placeholder.
- Do not expose, transmit, store, or retain user data beyond the behavior the user has been told to expect.
- Any feature that introduces collection, external transmission, sharing, or retention must make that behavior explicit and document its purpose and scope.
- Do not claim data is deleted, private, encrypted, or never retained unless that behavior has been verified for the relevant system.
- Limit access to sensitive material to people who need it for the task.

## Redaction and examples

The reference runner requires a frame-storage policy with a declared retention period and a preprocessing callback. That callback must redact or reject frames before they reach the artifact sink. The sink and host remain responsible for enforcing expiration and deletion; the skills do not supply storage infrastructure.

Use placeholders such as `[REDACTED]`, `example.com`, or synthetic records. Remove secrets from screenshots, logs, issue reports, and sample output. Check surrounding context too: removing a name alone may not prevent identification. Avoid publishing raw private content even if a user supplied it, unless its use is necessary and clearly authorized.

When a privacy incident is suspected, stop further exposure, preserve only the minimum information needed to investigate, notify the appropriate maintainer through a private channel, and follow applicable organizational procedures. Do not put incident details containing personal data in a public issue.
