# Notebook activity and instructions

Notebook activity derives from account-local suggestions, agent jobs/messages and reviewed artifacts. A draft and its generation job appear once. Counts represent stored work states, not illustrative activity. Pending task changes reuse the existing revision-aware suggestion accept/reject endpoints; draft actions reuse the chat artifact component. Home reads these same notebook work records.

Notebook instructions are stored separately with a notebook foreign key and revision. Saves reject stale revisions. Scoped agent and Tutor requests include the selected notebook's instructions and exclude chat history from other notebooks. Delegated specialists receive the same selected notebook policy. Unscoped chat does not silently apply another notebook's policy. Instructions supplement user-selected agent roles; they do not grant external tool permissions.

Running managed agent tasks are registered by persisted job ID in their account process. Stop validates agent ownership and cancels that task, preserving an interrupted job record and terminating its managed CLI subprocess. A canceled turn does not publish a successful reply or artifact. Restart recovery continues to mark lost jobs interrupted.

Existing Summary, notes, meetings, to-do editors, colours, collection tree and shader remain available. Activity is the default notebook view; Brief, Conversations, Files, Tasks and All items expose the existing content without inventing filing, comparison, Undo or approval events that have no persisted evidence.

Delegated research/draft jobs are included in the same activity projection. Their production completion now creates a local reviewable artifact instead of immediately writing a Gmail draft; the Work tab uses the same review component. Research and drafting prompts are general-purpose, with example-specific dates and compliance instructions removed from the production path. Explicit sample fixtures remain isolated sample data.
