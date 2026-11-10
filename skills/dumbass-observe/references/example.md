# Worked example

Request: “Compare the two checkout sessions. The novice could not find shipping cost; the expert found it after expanding a summary. Produce one evidenced finding while preserving the different outcomes.”

## The finding

The novice and expert outcomes differ and both are kept: one failed to find the cost, the other found it at the price of an extra step. The finding links exact frames and events from both sessions and keeps severity (consequence for the task) separate from confidence (how clearly the evidence shows it).

```json schema=findings
{
  "schema_version": "1.0.0",
  "run_id": "checkout-1",
  "findings": [
    {
      "finding_id": "F-1",
      "title": "Shipping cost is not visible before the payment step",
      "task_id": "task-001",
      "personas": [
        "novice",
        "expert"
      ],
      "principles": [
        "information-scent",
        "progressive-disclosure-and-efficiency"
      ],
      "evidence": [
        {
          "session_id": "novice",
          "frame_id": "n-f4",
          "event_id": "n-e7",
          "description": "Order summary lists items and Subtotal only; no shipping line"
        },
        {
          "session_id": "expert",
          "frame_id": "x-f5",
          "event_id": "x-e9",
          "description": "Shipping appears only after expanding Order details"
        }
      ],
      "symptom": "The order summary shows Subtotal and Total with no shipping line. The expert found shipping inside a collapsed Order details panel; the novice never opened it.",
      "consequence": "A first-time buyer cannot find the shipping cost before committing, and an experienced buyer needs an extra expand step to get a figure the page should state.",
      "severity": "medium",
      "confidence": "high",
      "recommendation": "Show the shipping amount, or a clear estimate, in the summary before the payment step.",
      "acceptance_criteria": [
        "Shipping cost or estimate is visible in the order summary without expanding anything",
        "A fresh novice session names the shipping cost before payment"
      ]
    }
  ],
  "extensions": {}
}
```

## Validation record for the report

A good report also says what the observer refused to carry forward. Written under “Coverage and unresolved questions”, it reads like this:

> Validation notes. The expert frame `x-f7` failed its sha256 check, so it was excluded and F-2 (which cited only that frame) is not reported. The novice outcome was recorded as `completed` in a static run; it is shown as `inconclusive` because nothing was exercised. A draft claim that the page “fails WCAG 2.1 AA” was removed; the visible observation behind it (light grey helper text) is kept at low confidence.

See [the severity rubric](severity.md) and [the evidence contract](evidence.md).
