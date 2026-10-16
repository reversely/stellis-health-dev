# Coverage ledger

Statuses follow `PLAN.md`: VERIFIED means observed and reproducibly tested; PARTIAL means tested with known gaps; BLOCKED means investigation cannot proceed with a documented reason; UNEXPLORED means discovered but not yet investigated.

| Feature | Entry point | States discovered | Interactions tested | Evidence | Status |
|---|---|---|---|---|---|
| Home feed | `/home` | Populated, date-grouped feed | None | REA `ev_870d788a5f039e4a18b1a52dc56827990d992482a57185844961714e7978bde5` | PARTIAL |
| Conversation details | Home cards | Linked cards | None | Same REA capture | UNEXPLORED |
| Search / Ask | Home search | Default | None | Same REA capture | UNEXPLORED |
| Recording | Record button | Default | None | Same REA capture | UNEXPLORED |
| Import | Import button | Default | None | Same REA capture | UNEXPLORED |
| AI Chat | `/otter-chat` | Composer and default controls | Route opened | REA `ev_d86cf8582235fc7f7abaf7b4c4cd2fc58640ff53f1d265c3f3fb8bec75f7ee57` | PARTIAL |
| Meetings | Quick access | Control present | None | Same REA capture | UNEXPLORED |
| Action Items | Quick access | Control present | None | Same REA capture | UNEXPLORED |
| Integrations | `/setting/connected_apps` | Discovery list | Route opened | REA `ev_345bf1cd90667b2e452113fc3d8573627a27c7ba0d656e739745cd6134d0ecee` | PARTIAL |
| Channels | `/group` | Empty state | Route opened | REA `ev_53af4fa2243cef388c43341af3cf285f4d866d4534e3bf323dcd3133c1096fc5` | PARTIAL |
| Direct messages | `/direct-messages` | Empty state | Route opened | REA `ev_a266f69112abb0f34a00d23f9c140437668d7feb9c2cdf7958b9b3493e8671ac` | PARTIAL |
| Folders | `/folder` | Empty state | Route opened | REA `ev_209221203f8c2bce46e0ae2478c0179c9ea4e3e362e4f71a18c84b777b0ca287` | PARTIAL |
| Notifications | Header | Button present | None | Same REA capture | UNEXPLORED |
| Workspace setup | `/manage-team/team-profile` | Team creation prompt and management access message | Route opened | REA `ev_3e20d9dfaec99af409f93af73fea4eb7311bdd6bdee76d587901b0022ea80e01` | PARTIAL |
| Plan / upgrade | Header | Button present | None | Same REA capture | UNEXPLORED |
| Zoom connection | Home banner | Offer visible | None | Same REA capture | UNEXPLORED |
| Desktop app | Home promotion | Download control present | None | Same REA capture | UNEXPLORED |
| Account menu | Profile control | Control present | None | Same REA capture | UNEXPLORED |
| Sidebar expansion | Home toggle | Compact and expanded label | Click toggle once | Live browser interaction, 2026-10-16 | PARTIAL |

No feature meets the VERIFIED gate yet. Login was performed by the user and was not recorded as a reproducible workflow.
