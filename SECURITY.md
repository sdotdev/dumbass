# Security policy

## Reporting a vulnerability

Please report suspected security vulnerabilities through [GitHub private vulnerability reporting](https://github.com/sdotdev/dumbass/security/advisories/new) rather than opening a public issue. Include the affected version or revision, the relevant component, the steps needed to reproduce the issue, and its likely impact. Redact credentials, personal information, and data belonging to other people. Do not include live secrets in an issue, commit, or test fixture.

If GitHub private reporting is unavailable, contact the repository owner without exploit details and request a private route. Avoid disclosing exploit details publicly until maintainers have had a reasonable opportunity to investigate and coordinate a fix.

## Scope and handling

Security reports may include vulnerabilities in code, dependencies, documentation that encourages unsafe behavior, privacy leaks, or ways to bypass safety and confirmation boundaries. Maintainers should acknowledge reports, assess impact, coordinate a fix, and communicate any necessary user action. Do not request or retain more personal data than is needed to investigate.

The project should not claim that a report is fixed or that a system is secure until the relevant behavior has been reviewed and, where applicable, validated by a human. See [the safety and action policy](docs/safety-and-actions.md) and [human validation guidance](docs/human-validation.md).

## Safe handling

- Keep reports and reproduction artifacts private while they contain exploitable details or sensitive data.
- Use synthetic or redacted data in reproductions whenever possible.
- Do not test against systems or accounts without authorization.
- Document the affected versions, mitigations, and known limitations when communicating a fix.
