# Compatibility and extensions

Extensions should build on documented behavior and preserve user expectations. Treat public interfaces, configuration keys, stored data formats, and extension hooks as compatibility contracts once released. If no contract is documented, do not imply stability.

## Compatibility changes

Document behavior changes and migration steps. Prefer additive changes and explicit versioning for incompatible changes. Do not silently reinterpret existing settings or stored data. Preserve user data during upgrades and provide a safe recovery path for migrations that can fail.

## Extension requirements

An extension must:

- request only the access needed for its stated function;
- describe any data collection, transmission, storage, or retention it introduces;
- preserve privacy, redaction, accessibility, and safety requirements in this documentation;
- keep external actions visible and subject to explicit confirmation;
- avoid using persona labels or intelligence stereotypes as internal measures of quality or user capability;
- distinguish its own behavior from core project behavior and identify unsupported combinations.

Extensions may add presentation styles, but cannot bypass safety policy, obscure data flows, impersonate people, or turn recommendations into unconfirmed external actions. Review extensions against [the safety policy](safety-and-actions.md), [privacy guidance](privacy.md), and [human validation guidance](human-validation.md).
