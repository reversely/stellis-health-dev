# Unknowns and investigation queue

| Unknown | Attempt so far | Why unresolved | Evidence needed |
|---|---|---|---|
| Full route inventory | Home and six linked routes inspected | Nested controls, overlays, and conversation details remain unvisited | Visit every visible entry point and record resulting routes/states |
| Conversation detail behavior | Cards identified on Home | Opening a card may expose private meeting data | Inspect a safe representative record; redact content in saved evidence |
| Sidebar expanded layout | Toggle clicked; accessible label changed | Visual layout and keyboard behavior not yet checked | Capture a redacted expanded-state screenshot and test keyboard/focus |
| Search, import, record, and other controls | Entry points inventoried | Workflows not exercised | Repeatable interaction traces with safe data |
| Responsive behavior | Initial viewport measured at 800 × 600 | Desktop, tablet, and mobile comparisons not yet run | Capture same routes at fixed viewports |
| Network and client-state contracts | Passive Home DOM/accessibility captured | REA attached after login and cannot recover past traffic | Arm capture before each future interaction; inspect relevant requests and bundle code |
| Permission and subscription limits | Current account UI observed | Alternate roles/plans unavailable in current session | Test only accessible states and classify inaccessible paths |
| Team management | Team profile route opened | Page says current account has no workspace management access; team creation points to purchase | Record accessible team setup UI without purchasing; classify management actions as blocked if no alternate authorized role exists |

Do not store authentication data, account identifiers, meeting titles, transcript text, or raw private payloads in the repository.
