# Desktop Trends alignment and Table control

Issue: [#175](https://github.com/reversely/stellis-health-dev/issues/175). Owner reference: [the supplied desktop screenshot](../trends-organization/trends-1280-light.png). Related brief: [Dash/Trends evaluation](../../../plans/dash-trends-evaluation.md).

Implemented: the Trends workspace uses its available desktop width. Vital signs have two columns above 1000px and three above 1800px. Other categories share two columns. Cards align at top and bottom; chart summaries and legends use consistent rows. Phones keep one column. Table is a labelled, keyboard-accessible switch in the upper-right corner of each card; it replaces the plot with the readings table and retains its state when the selected range repaints. Footer Show table/Hide table buttons are removed.

Comparison copy uses “Lower than usual”, “Higher than usual” and “Within usual range”; possessive usual-range phrasing is removed from Trends, overview cards, camera comparisons, hints and legends.

Verified: twelve native layouts in both themes at 360, 390, 768, 1024, 1280 and 1920px; four populated cards including three vital signs; same-row and equal-height desktop geometry; stacked phone geometry; upper-right Table placement; chart/table switching; metadata, saved readings, reload, forms, scrolling and no overflow. The existing UI consistency audit passes 50 route/theme/viewport states. 28 Trends/goals JavaScript tests pass, and the shared stylesheet audit passes. Screenshots use synthetic readings.

The optional Dash/Mantine comparison is separate, under `../176/`, and does not replace the application runtime.
