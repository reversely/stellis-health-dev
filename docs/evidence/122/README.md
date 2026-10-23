# Consolidated health navigation

Request: [owner ticket #122](https://github.com/reversely/stellis-health-dev/issues/122)

My Health and Ask Stellis are the two primary destinations. Active notebooks appear beneath their actual collections; empty collections, archived notebooks and individual source rows stay out of the navigation tree. User-defined notebook names remain intact. Collection expansion keeps its existing remembered state, and Add Notebook opens the curated selector. Dashboard notebook-preview choices do not archive notebooks or restrict this full active tree.

Summary, Trends, Records and Timeline open through My Health and retain their existing URLs. Notebook chat, source workspaces and the old check-in URL remain available. Settings stays at the foot of the tree.

Phones and tablets up to 1000px have a fixed bar with My Health, Ask Stellis and Notebooks. The Notebooks modal temporarily contains the existing tree, so its selection, collapse and drag/drop handlers remain usable. Close and Escape restore focus. Closing the curated selector also restores a visible trigger. Large trees scroll beneath a fixed modal heading. Detail pages retain compact desktop navigation; recording retains its existing desktop workspace/back navigation.

## Verification

- `tests/browser/health_navigation.mjs` checks the two primary destinations, active/archived/empty collection filtering, preserved custom names, collection collapse, notebook navigation, browser Back, dashboard-to-Summary navigation, old deep links and the mobile keyboard/modal/selector flow
- Six widths in both themes: 360, 390, 768, 1024, 1280 and 1920px
- Layout audit: My Health, Ask Stellis, Summary, Records, Timeline, Trends, Settings, notes, documents, notebooks and recording have no final failures or warnings
- The fixed mobile bar is excluded from background-content overlap checks; a separate check verifies its viewport position and minimum 44px targets
- The notebook modal passes separate layout checks at 360, 390 and 768px in both themes
- Authenticated call regression passes greeting, connection loss, apology and retry at all six widths in both themes; call panels leave room for the mobile bar
- Final browser page errors: none

Local reports: `/tmp/stellis-navigation-final-{light,dark}/report.md` and `/tmp/stellis-navigation-modal-{theme}-{width}.json`, with screenshots beside them. The browser uses isolated test accounts and writes no production data. This ticket changes navigation and UI state only; no clinical content or notebook associations are migrated.
