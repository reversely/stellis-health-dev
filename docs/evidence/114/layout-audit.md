# Layout results

Checked 360, 390, 768, 1024, 1280 and 1920px in each theme with the layout-audit skill. The table includes rechecks after fixing the phone composer overlap and small link targets.

| Route | Light failures / warnings | Dark failures / warnings |
| --- | --- | --- |
| `/` | 0 / 0 | 0 / 0 |
| `/trends` | 0 / 0 | 0 / 0 |
| `/records` | 0 / 0 | 0 / 0 |
| `/summary` | 0 / 0 | 0 / 0 |
| `/timeline` | 0 / 0 | 0 / 0 |
| `/todos` | 0 / 0 | 0 / 0 |
| `/settings` | 0 / 0 | 0 / 0 |
| `/recording` | 0 / 0 | 0 / 0 |
| `/chat` | 0 / 0 | 0 / 0 |
| `/page/<id>` | 0 / 0 | 0 / 0 |
| `/notebook/<id>` | 0 / 0 | 0 / 0 |
| `/document/<id>` | 0 / 0 | 0 / 0 |
| `/auth` | 0 / 0 | 0 / 0 |
| `/onboarding` | 0 / 0 | 0 / 0 |

The fixtures use a separate local account, one notebook, a short note and a sample image document. Authentication uses an anonymous context. The onboarding layout fixture serves the real onboarding HTML and returns the welcome step for this completed test account. Real onboarding navigation also passes in the browser regression.

The audit excludes the decorative rail canvas and visually hidden helpers. The first Home visit logged one missing-resource response; the browser regression reports no application page errors.

Full local reports and screenshots:

- `/tmp/stellis-style-audit-light/report.md`
- `/tmp/stellis-style-audit-dark/report.md`
- `/tmp/stellis-style-recheck-light/report.md`
- `/tmp/stellis-style-recheck-dark/report.md`
- `/tmp/stellis-style-interactions/` contains Home, camera dialog and open activity picker captures in both themes
