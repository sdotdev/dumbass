# Worked example

Request: “Task: update the reporting date range and export the matching rows. You understand reporting terminology but have never used this dashboard. Note forced tutorials or redundant steps.”

## Events

Record the friction as it happens, tied to a frame: here a mandatory tour sits in front of the control the expert wants.

```jsonl schema=event
{"schema_version": "1.0.0", "run_id": "trial-1", "session_id": "expert", "event_id": "x-e1", "sequence": 1, "timestamp": "2026-11-10T12:00:02Z", "type": "observation", "status": "ok", "frame_id": "x-f1", "observation": "Reports page. A full-screen tour modal covers the date filter and requires Next three times before Skip appears."}
{"schema_version": "1.0.0", "run_id": "trial-1", "session_id": "expert", "event_id": "x-e2", "sequence": 2, "timestamp": "2026-11-10T12:00:03Z", "type": "action", "status": "ok", "frame_id": "x-f1", "next_frame_id": "x-f2", "action": {"type": "click", "x": 1180, "y": 120, "classification": "local"}}
{"schema_version": "1.0.0", "run_id": "trial-1", "session_id": "expert", "event_id": "x-e3", "sequence": 3, "timestamp": "2026-11-10T12:00:04Z", "type": "observation", "status": "ok", "frame_id": "x-f2", "observation": "Tour step 2 of 3 appeared; Skip is still absent. Third mandatory tour click to reach the filter."}
{"schema_version": "1.0.0", "run_id": "trial-1", "session_id": "expert", "event_id": "x-e4", "sequence": 4, "timestamp": "2026-11-10T12:00:05Z", "type": "stop", "status": "inconclusive", "frame_id": "x-f2", "observation": "Budget for this attempt reached before the export step."}
```

## Outcome

Report efficiency as actual actions and observed friction, never as an invented human duration. A budget that runs out is a `partial`, not a failure of the persona.

```json schema=outcome
{
  "schema_version": "1.0.0",
  "run_id": "trial-1",
  "session_id": "expert",
  "persona": "expert",
  "task_id": "task-002",
  "status": "partial",
  "summary": "Reached the date filter only after forced tour steps; did not reach the export within the action budget.",
  "evidence": [
    {
      "session_id": "expert",
      "frame_id": "x-f2",
      "event_id": "x-e3",
      "description": "Tour step 2 of 3 with no Skip control"
    }
  ],
  "actions": 3,
  "duration_ms": 5000,
  "uncertainties": [
    "Whether Skip appears on step 3 was not observed",
    "Export step not reached"
  ],
  "stop_reason": "budget-exhausted"
}
```

Not every explanation is friction: if a unit or filter scope is genuinely ambiguous, read it and say so even though it costs time. Follow [the action policy](safety.md).
