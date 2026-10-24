# Check-in icon alignment correction

Owning ticket: [#156](https://github.com/reversely/stellis-health-dev/issues/156).
Reference: [user-supplied dark phone panel](../panel-390-dark.png); [original brief and demo references](../README.md); [style guide](../../../ui-style-guide.md).

The supplied panel shows the checkbox below the goal icon and compressed review spacing. Message-list styles were reaching nested review rows. Restricting them to direct messages restores full-width rows and shared spacing; the goal icon spans its title and detail rows so its center aligns with the checkbox.

Verified with `tests/browser/coach_checkin.mjs` using the isolated scripted-model server: 390px and 1280px, light and dark, full-width review rows, checkbox/icon centers within 1px, no horizontal overflow or page errors. The existing snooze, agenda, proposal, explicit confirmation and persisted goal checks pass. Screenshots use synthetic records and scripted model replies. Visually inspected the corrected 390px dark panel against the supplied reference. Existing Tabler glyphs, 44px header controls, native checkbox styling and shared theme roles are preserved. `python3 scripts/audit_ui_styles.py` passes with zero component palette/corner literals. This validates the revised check-in layout, not a new audit of every app screen.
