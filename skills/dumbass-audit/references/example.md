# Worked example

Request: “Audit https://example.test/checkout. Evaluate finding shipping cost and completing a test checkout with the supplied sandbox account. Report confusing steps and unnecessary expert friction.”

## What good handling decides up front

- **Tasks:** two concrete tasks, “find the shipping cost before paying” and “complete a test checkout”, each with a success criterion visible on screen (for example, the order-confirmation page).
- **Mutation:** submitting the sandbox order is a mutation. It runs only if the manifest records an authorization for exactly that action (`authorized_mutations`); every other purchase, send or delete stays blocked. Use [the run manifest example](../assets/example-run.json) for the structure. It is illustrative and is not permission to contact example.test.
- **Mode:** interactive only if a screenshot and action adapter is actually available. If the user instead pastes three screenshots, the run is static, and the capability record says so.

## Capability record for a degraded run

This is what honesty looks like when the host gives two pasted screenshots, no click tool and no isolated contexts. It is what the observer and the report then quote as limitations.

```json schema=capabilities
{
  "schema_version": "1.0.0",
  "host": "chat-session",
  "adapter_version": "none",
  "mode": "static",
  "capabilities": {
    "screenshots": true,
    "coordinate_actions": false,
    "keyboard": false,
    "isolated_sessions": false,
    "baseline_reset": false,
    "enforced_tool_boundary": false,
    "native_device": false
  },
  "extensions": {},
  "limitations": [
    "Screenshots supplied by the user; nothing was clicked",
    "Novice and expert ran one after the other in one context, so they are not independent",
    "The host does not restrict evaluator tools; isolation is by instruction only"
  ]
}
```

Outcomes and findings must come from actual supplied evidence. Follow [the action policy](safety.md).
