# Phone Send alignment

Ticket: [#156](https://github.com/reversely/stellis-health-dev/issues/156). References: [supplied screenshot](../panel-390-dark.png), [original brief/demo references](../README.md), [style guide](../../../ui-style-guide.md).

Follow-up feedback identified the Send button as part of the requested alignment. The original phone composer reserved an unused fourth column and placed Send in the middle flexible column. Use three columns by default, align Send to the end, and reserve the fourth column only when the tour has its Next action. The field retains its separate phone row and the voice controls retain their slots.

Validated with the isolated scripted-model check-in fixture and `tests/browser/coach_checkin.mjs`: 390px and 1280px in light/dark, phone Send and field right edges within 1px, Send below the field, existing icon alignment and full-width review checks, no overflow or page errors, and confirmation/save behavior. Visually inspected the dark 390px screenshot. Style audit passes with zero component palette/corner literals. Tour behavior was preserved structurally; a live tour was not exercised. Screenshots contain synthetic records and scripted model replies.
