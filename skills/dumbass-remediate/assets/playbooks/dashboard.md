# Dashboard and data-heavy application remediation playbook

Use this playbook for analytics, reporting, monitoring, and operational interfaces where users compare, filter, interpret, or act on data. Verify the data meaning and interaction model alongside presentation.

## Triggers

- A user cannot answer the question a KPI, chart, or table is meant to support.
- Values lack definitions, units, timeframe, source, freshness, or comparison context.
- Filters, date ranges, sorting, pagination, selection, or export are hard to discover or give unclear results.
- Dense data is inaccessible, misleading, slow, or unusable on smaller screens or with assistive technology.
- Empty, partial, stale, loading, permission-limited, or failed data is presented as if it were complete.

## Evidence to collect

- Record the decision/task, expected data scope, account/permissions, selected filters and date range, timezone, dataset size, and expected result.
- Capture the visible query state before and after each interaction, including applied filters, sort direction, page, selection, and URL/state persistence if expected.
- Obtain a known fixture or independently calculated sample to compare values, totals, units, rounding, and filter behavior.
- For charts, record title/question, axes and units, legend, time interval, color/shape encoding, point-level values, and equivalent accessible/text representation.
- For tables, record header associations, row/column context, sort state, pagination/virtualization behavior, selection scope, and export contents.
- Measure wait time and note whether stale data, partial results, permission restrictions, and errors can be distinguished. Do not infer a data defect solely from an unexpected but unverified value.

## Fix strategy

1. Establish the user question and source-of-truth meaning for each displayed metric. Document definition, unit, time window, timezone, aggregation, and freshness before changing labels or calculations.
2. Correct query semantics and filter scope first, then clarify visible state. Keep applied filters and date range persistent and removable; distinguish draft filter selections from applied results.
3. Make chart purpose and interpretation explicit with a descriptive title, axes, units, time context, and legible legend. Use patterns, symbols, labels, or direct values so color is not the only distinction. Offer a text/table equivalent for important findings.
4. Make table headers programmatically associated with cells, sort controls announce direction, and pagination/selection scope explicit. On narrow layouts, choose a documented alternative such as prioritized columns, row cards, or a contained horizontal table; do not silently hide task-critical fields.
5. Keep export consistent with the displayed query. State whether it includes all filtered rows or only the current page and include relevant field names, units, and time context.
6. Distinguish no records, no matches for current filters, incomplete/partial data, stale data, access restrictions, loading, and query failure. Give the user a specific next step where possible.
7. For long requests, preserve context and filters, communicate progress when useful, and prevent duplicate actions. Verify calculations against known fixtures and test both typical and large datasets.

## Anti-patterns

- Changing metric calculations or labels without confirming the source definition and aggregation.
- Using an unlabeled “Other” bucket, unexplained units, truncated axes, or a second axis that creates false comparisons.
- Encoding series only by color or communicating values only through hover.
- Resetting filters after refresh, hiding active filters, or applying a filter without indicating its scope.
- Treating zero, no match, not yet loaded, stale, unavailable, and failed data as the same blank panel.
- Exporting only the visible page while implying the entire filtered result was exported.
- Hiding table columns on mobile without preserving access to their values, or making every chart/table a miniature unreadable version of desktop.
- Showing decorative skeletons or spinners without communicating prolonged failure or stale-data status.

## Verification and acceptance criteria

- A user can state what each primary KPI means, its unit, applicable timeframe, and freshness from the interface or a directly available definition.
- Against a known fixture, displayed values, totals, rounding, and filter results match the documented calculation and scope.
- Every applied filter and date range is visible, keyboard operable, removable/resettable, and reflected in the results; retained state matches the product's documented persistence behavior.
- Charts have a descriptive title, labeled axes/units where applicable, clear timeframe and legend, and do not rely on color alone; key values can be obtained without hover and through an accessible equivalent.
- Table headers and cells have meaningful associations; sorting exposes the active column and direction; pagination and selection scope are clear to keyboard and screen-reader users.
- Export contents match the stated scope and include enough labels/units/time context to interpret the data outside the dashboard.
- Loading, zero data, zero matches, partial/stale data, permission denial, and request failure are distinguishable. Failure offers a relevant retry or recovery action without silently discarding the query.
- On supported narrow widths and at the agreed dataset scale, task-critical values/actions remain available and users can complete the named analysis task.

