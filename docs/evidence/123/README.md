# Global health capture

Request: [owner ticket #123](https://github.com/reversely/stellis-health-dev/issues/123).

The persistent Add control opens Take Photo, Enter Reading, Upload Record, Record Visit, Add Appointment and Check-in. Desktop uses the available toolbar space; mobile navigation adds a labelled fourth slot. Ask Stellis opens the same capture dialog beside Send and passes the selected notebook. Notebook pages preselect their notebook. General capture offers general health history and optional notebook association.

Uploads reuse the document and recording importer. Record Visit starts the existing microphone workflow with its notebook destination. Enter Reading reuses the Trends form. Check-in embeds the existing scoped widget in a labelled native dialog. Close and Escape restore focus. Dialogs use the shared motion rules, keyboard immediacy and reduced-motion path. Actions reuse the primary and secondary theme roles; dark overlays retain 80% white glass.

## Photo review

Device photos support scales, blood pressure monitors, glucose meters and temperature displays. Medical-document photos use document ingestion. The original image remains in Records. Device recognition uses the existing bounded local OCR service and a conservative parser. Unsupported or unreadable text opens an empty correction form. The person reviews the value, unit and date before Save reading sends a confirmation request. Multiple candidates remain selectable. Source links open the retained image.

Supported conversions save canonical Trends units: pounds to kilograms, mmol/L to mg/dL and Fahrenheit to Celsius. Conversion references: [USGS conversion table](https://pubs.usgs.gov/pp/2004/1686a/conversion.html) and [NIDDK glucose conversion table](https://www.niddk.nih.gov/-/media/Files/Strategic-Plans/Diabetes-in-America-3rd-Edition/DIA_Conversions.pdf). The service validates converted values and paired blood pressure numbers. Retry keys make confirmed readings idempotent. Notebook and document identifiers resolve within the current account. Deleting a source preserves the confirmed value and clears its source link.

## Saved views

Manual and photo readings appear in Trends, Health History and their notebook's measurement and timeline projections. Appointments retain Scheduled or Planned status, date, note and optional notebook. Future appointments appear in Upcoming; the full Timeline and notebook projections retain saved events. Appointment links open a detail dialog. Source records and calendar appointments retain their original links and provenance.

## Verification

- The relevant Python suite runs 46 tests: 44 pass and two OCR tests skip because Tesseract is unavailable
- Three Node tests pass dashboard provenance and selection checks
- Backend tests cover candidate units, paired readings, missing units, partial-number rejection, conversion bounds, review without saving, corrected confirmation, retry identity, invalid notebook/source identifiers, source deletion, existing-schema migration and appointment persistence
- Browser tests use isolated local accounts and real writes for manual readings, corrected photo readings, source links, notebook association, appointments, check-ins, document uploads and recording destinations
- Photo browser checks cover manual fallback and retained-text candidate review; this development machine has no Tesseract executable, so optical recognition quality is outside this run
- The existing hosted Dockerfile installs Tesseract and English language data; this change adds no dependency or external provider
- Local OCR retains the existing process deadline, raster limits and shared execution lock; parsing caps input at 100,000 characters and returns at most ten candidates
- Opening Add renders its six actions immediately; data requests begin after an action is chosen
- Layout checks cover 360, 390, 768, 1024, 1280 and 1920px in both themes, including 72 capture-dialog layouts and 48 notebook, document, chat and recording layouts; the mobile Add target fills its grid slot

Local reports: `/tmp/stellis-capture-{light,dark}/report.md` and `/tmp/stellis-capture-modal-audit.json`, with screenshots beside them. Test images and account data stay outside Git.

Final layout results have no failures or warnings. The first route audit records one missing-resource 404; the capture browser reports no application page errors. Additional context checks are saved in `/tmp/stellis-capture-context-audit.json`.
