# 0070: Manage agent deployment from notebook rows

Accepted, 2026-10-20. Issue #438, wireframe screen 11.

The previous accordion listed agent identities rather than the notebook deployment relationships shown by the reference. Agent settings now groups actual notebook rows by collection, with agent chips and Add. Selecting a chip opens a detail panel with the agent's behavior, scoped memory, enabled state and Chat/Rename/Remove. Instructions and memory remain editable, and adding uses the existing template/named-copy workflow. The richer existing library rail and agent avatars remain.

The reference's notebook-level Off state requires a deployment-level setting. `agent_notebooks.enabled` defaults on during migration; it is independent of the existing identity-wide enabled flag. Scoped chat, Tutor, delegation and automatic steward resolution enforce it. Unscoped retrieval excludes disabled assignments and their notebook memory. Global disabling remains available in thread Setup. Removing a chip detaches the selected notebook, preserving chat and memory; it is not identity deletion. A detached default-named Steward can be reattached without colliding with its retained name.

Runs now describes actual implemented entry points rather than one generic sentence. New-thread email monitoring from the Writing mockup is still absent and explicitly identified as such. This UI delivery does not close that remaining part of #438 or claim automatic scheduling. Tutor still guides the learner and never clicks on their behalf.

Verification uses isolated account data, real SQLite, the real managed local runtime and browser interactions. Seven widths in both themes pass layout checks; selected-agent, off/reload/on, rename, remove, add and memory display were exercised. The layout audit now checks native visibility so closed disclosure descendants are not mistaken for painted overlapping content; the known-broken fixture remains checked separately.
