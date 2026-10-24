# Chart overlays, table icons and measurement categories

Owning ticket: [#178](https://github.com/reversely/stellis-health-dev/issues/178). Owner reference: [the supplied screenshot](reference.png). Related brief: [Dash Trends evaluation](../../../plans/dash-trends-evaluation.md); previous comparison: [#176](../176/README.md).

## Changes

- Replace Plotly's unified hover box with a client-side Dash tooltip: 12px vertical and 16px horizontal padding, soft corners, a purple surface and light text. It contains one date and one coloured marker/value line. It has no repeated header date or dashed crosshair, hides on pointer leave, and stays within the viewport at chart edges.
- Replace Table switches with 44px Tabler table icon buttons in the Dash preview and native Trends page. Accessible name: Table view. The pressed state indicates the table; clicking again restores the chart. The shared Tabler license already covers this icon; the local SVG retains its established path.
- Remove the unconditional static Usual range footer. Where a supported baseline exists, display its actual calculated bounds and units beside a band key; omit both band and legend without one. Native chart legends also show actual bounds.
- Replace sidebar anchors with category-selection callbacks that render the corresponding panel and update its active state. A labelled Measurements selector exposes the same navigation on phones. Body measurements and Blood sugar show their own data; Sleep and Symptoms explicitly show No readings for the sample fixture. They do not navigate to an empty anchor.

## Validation

`tests/browser/dash_trends_preview.mjs` passes twelve responsive layouts in both themes at six widths, real table icons, filtering/order/range/theme callbacks, all five desktop categories and the mobile selector. Tooltip checks cover first/last points at 390px and 1440px in both themes, a single date and marker, exact padding, staying within viewport bounds and hiding on leave. Browser fixtures verify that missing baseline data removes the band/legend, and supplied bounds of 65–68 bpm appear exactly. No page/console errors or external requests occur.

`tests/browser/trends_layout.mjs` passes twelve native layouts, card alignment, icon toggling, saved readings/reload, forms and scroll geometry. The shared UI audit passes 50 route/theme/viewport states, and 28 Trends/goals helper tests pass. The shared stylesheet audit reports zero component palette/corner literals. Screenshots were visually inspected against the supplied reference. `native/` contains the application checks; top-level captures show the Dash comparison.

The Dash environment uses synthetic values and remains a standalone comparison. These checks do not establish account authentication, live camera/model results, or production Dash integration. Earlier #175/#176 evidence is preserved.
