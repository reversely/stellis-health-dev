# Sidebar highlight palette

Owning ticket: [#181](https://github.com/reversely/stellis-health-dev/issues/181). Owner request: no fuchsia sidebar highlights. Relevant comparison: [Dash/Mantine evaluation](../../../plans/dash-trends-evaluation.md) and [previous sidebar](../178/category-vital-signs.png).

The Dash theme now uses its existing dark-purple scale instead of the grape primary fallback. Sidebar buttons explicitly use the shared ink color; selected and hover backgrounds remain the shared raised surface. Keyboard focus uses the same ink role. There is no fuchsia sidebar state.

Browser checks exercise selected, hovered and focused category buttons in both themes, compare their actual computed text/background colors with the shared roles, and verify category content changes. Screenshots and `checks.json` retain the rendered results. The existing twelve-layout Dash regression also checks all categories, phone selection, tables, ranges and tooltips. All values remain synthetic; this does not change production Dash integration.
