# Contributing

Contributions should make the project safer, clearer, and easier to use. Before proposing a change, read the [methodology](docs/methodology.md), [ethical framing](docs/product-and-ethics.md), [privacy guidance](docs/privacy.md), and [extension and compatibility rules](docs/compatibility-and-extensions.md).

## Proposed changes

Describe the user problem, the behavior that changes, and any compatibility or safety impact. Keep changes focused. For behavior changes, explain how a person can review the result and what assumptions remain. Do not claim automated checks establish correctness or safety beyond what they actually cover.

## Safety and privacy

- Do not include real credentials, private user data, or identifying examples in code, documentation, fixtures, or logs.
- Keep any new external data flow explicit, minimal, and documented; never add transmission or retention behavior by implication.
- Preserve confirmation boundaries for consequential actions. A suggested action and an executed action must be distinguishable.
- Do not use persona language that demeans users or associates intelligence, disability, or human worth with a mode.
- See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Review and validation

Every change needs review proportional to its impact. Human review is required for consequential behavior, safety policy, privacy handling, and claims about compatibility. Describe what was reviewed, what evidence supports the change, and what remains unverified. The project’s [human validation guidance](docs/human-validation.md) explains the expected review record.

## Documentation

Keep documentation in plain language, use descriptive headings and meaningful link text, and update cross-references when moving or renaming documents. Do not present illustrative examples as implemented capabilities.
