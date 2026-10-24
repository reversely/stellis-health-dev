# Notebook Ask: unread notebooks, citation check and the Records drop zone

Issue: [#160](https://github.com/reversely/stellis-health-dev/issues/160). Date: 2026-10-24. References: [notebook Ask](../../refs/stellis-demo/notebook-ask-sources-viewer.png), [upload and value review](../../refs/stellis-demo/upload-and-value-review.png).

## Change

- **Unread notebooks:** other notebooks whose ready sources match the question's distinctive words (full-text, no fallback) are stored with the answer and named under it. *Include <notebook> and ask again* reads their matching sources for one question; *Add from <notebook>* (in Sources) links them into this notebook.
- **Citation check:** each citation is marked found when its excerpt is still in its source's current text, shown as *n of m citations found on their page*.
- **Follow-ups:** *Open the <level> chart* when the answer names one of the notebook's Levels (it switches to the Brief tab and selects that level), and the include chips.
- **Viewer header:** the citation number as a colour block, the source's kind, date and page, and *Open the whole record*.
- **Records drop zone:** drag and drop or *Upload a report*. Recordings are refused here and point to Record. Each added document links to its page; the list refreshes.

## Evidence

- `tests/test_notebook_chat.py` (four new tests): an unread notebook and its matching source are named; including a notebook reads it for one question and leaves nothing unread; a question without distinctive words finds nothing; citations off their source are marked not found. The full suite passes: 709 passed, 2 skipped.
- `tests/browser/notebook_ask.mjs` (report fixture server, which replaces only model replies) covers the notice text, the check line, the include chip, *Add from*, the viewer badge, kind and date, and *Open the whole record*. Include and ask again produces an answer with nothing unread; a plain question brings *Add from* back, and using it adds the source with a status message. The Records drop zone uploads through the file chooser, shows the review link, the item appears in the list, and the dark phone layout has no overflow.
- `ui_consistency` and `answer_trace` pass.

## Limits

The reference words its notice from the records' meaning (*Your pregnancy blood tests are in the Pregnancy notebook*). This build names the notebook and states that the answer did not read it; it does not describe the matched records. The reference's per-citation explanation in the viewer (*Cited for the June 15 ferritin value*) would need the model to state why each source was cited.

## Follow-up layout correction

The owner's layout feedback and corrected browser evidence are tracked under this same ticket: [layout correction](layout-correction/README.md). This replaces the former unnumbered `docs/evidence/ask-layout/` location; original #160 evidence remains above.
