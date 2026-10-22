# Form controls and onboarding theme switch

Request and acceptance: [ticket #105](https://github.com/reversely/stellis-health-dev/issues/105)

## Reference

The owner supplied docs/uirefs/image.png showing the goal form's platform select arrow. The form already had themed borders and fills. The dashboard supplies the existing bare sun and moon switch.

## Changes

Shared form styles add a Tabler chevron and themed native select pickers where supported, plus defaults for text fields, text areas, buttons and checkbox states. Component styles retain their layout. Goal fields have a 44px minimum height. Onboarding reuses the dashboard SVG icons and shared switch styling; its accessible name describes the next theme.

The browser retains native select semantics and change events. Browsers without customizable select support keep their platform picker. The implementation follows [MDN's customizable select guidance](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select).

## Verification

Status: implemented and locally verified

- Goal form: Activity opens by keyboard; Escape closes the picker; medicine selection shows the medicine fields; Walk restores Amount; checkbox clicks change reminder state
- Keyboard focus: select controls show a visible outline after keyboard navigation
- Onboarding: both icon states render, the target measures 44px, accessible names describe the next mode, and storage retains the choice after reload
- Browser checks: Home and onboarding at 360, 390, 768, 1024, 1280 and 1920 pixels in both themes
- Layout audit: Home, onboarding and Account settings at those six widths in both themes, with zero failures and zero warnings
- Audit exclusions: the decorative rail canvas and intentionally visually hidden controls
- Onboarding harness: actual onboarding HTML and server state, with required set to true so a local account can inspect the welcome screen
- Console: no page errors in the interaction checks; Account settings requests /api/v1/account and receives 404 in the account-free local test profile
- Node goal UI tests: three tests pass; onboarding JavaScript syntax and git whitespace checks pass
- Security: native option text and values remain unchanged; the change adds no HTML insertion or external request
- Loading: no new dependency, stylesheet request, observer or animation loop

Local reports: /tmp/stellis-controls-audit-light/report.md and /tmp/stellis-controls-audit-dark/report.md. Screenshots sit beside each report. Open-menu screenshots use /tmp/stellis-controls-{theme}-{width}-menu.png.
