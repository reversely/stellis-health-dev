# Feature inventory — initial discovery

This list records entry points and the first route states observed after signing in. A visible control does not establish that its workflow is available or complete.

| Feature | Entry point observed | Investigation state |
|---|---|---|
| Home feed and conversation cards | `/home` | Feed structure observed; detail navigation untested |
| Search / Ask | Home search control, `⌘K` hint | Unexplored |
| Recording | Record button | Unexplored |
| Import | Import button | Unexplored |
| AI Chat | Sidebar link and quick-access control | Composer and controls observed; no prompt sent |
| Meetings | Quick-access control | Unexplored |
| Action Items | Quick-access control | Unexplored |
| Integrations | Sidebar link to `/setting/connected_apps` | Discovery list and Connect controls observed; no connection attempted |
| Channels | Sidebar link to `/group` | Empty state and New channel control observed |
| Direct messages | Sidebar link to `/direct-messages` | Empty state and New message control observed |
| Folders | Sidebar link to `/folder` | Empty state and New folder control observed |
| Notifications | Header button | Unexplored |
| Workspace setup | Create Workspace link to `/manage-team/team-profile` | Team creation prompt observed; management access denied in current account |
| Plan / upgrade | Upgrade button and plan indicator | Unexplored |
| Zoom connection | Home banner | Unexplored |
| Desktop app | Download control | Unexplored |
| Account menu | Profile control | Unexplored |
| Sidebar expansion | Open sidebar button | Toggle label changed; layout and persistence unverified |

Evidence: REA captures are indexed in `site-map.md`; live DOM link inspection on 2026-10-16.
