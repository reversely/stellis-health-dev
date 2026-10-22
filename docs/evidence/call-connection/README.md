# Call connection recovery

## Request

> on the call interface, when I attempt to click any Call Stellis item, the call is dropped: "The call dropped" with no other options. Please investigate what's causing this and insert a brief apology into the copy as in Sorry, we couldn't reach the agent etc

## Findings

The account gateway accepted only the intake WebSocket route. It rejected coach and tour connections before the call started. Its upstream URL also omitted query parameters. Coach calls need those parameters to initialize their kind and local date.

The gateway now relays all three explicit call routes with their query parameters. Session and same-origin checks still apply. Both call interfaces use “Sorry we couldn't reach the agent”. The docked panel expands after termination and focuses Call again. Retry preserves the original call kind.

## Verification

Status: implemented and locally verified

- Targeted Python suite: 21 tests passed and three route subtests passed across account gateway, coach call and tour tests
- Real gateway subprocess checks: ordinary calls, morning check-ins and tours reach ready and their opening messages
- Gateway security checks: missing sessions and foreign origins fail for each added call route
- Isolated browser panel checks: 360, 390, 768, 1024, 1280 and 1920 pixels in light and dark themes
- Browser checks cover apology visibility, termination while minimized, retry retaining the call kind and Close removing the panel
- Geometry checks found no clipped status or button text and no horizontal viewport overflow among those controls
- Browser page errors: none

The browser harness uses the actual panel scripts and styles with simulated connection events. Screenshots are saved under /tmp/stellis-call-{theme}-{width}.png. The layout-audit skill's bundled script is absent from this checkout, so these checks use Playwright geometry assertions. Full-page layout auditing remains unverified. Live microphone, speech output and hosted deployment remain unverified.
