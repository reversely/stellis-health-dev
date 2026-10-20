# ADR 0065: Durable first-run setup and reviewed starter workspaces

Status: implemented for #391 and #392, with the starter foundation for #393.

New accounts persist `onboarding_completed=0` in the account registry. Migration marks existing accounts complete. HTML workspace requests redirect unfinished accounts to `/onboarding`; static/shared assets, APIs and OAuth callbacks retain their routes. Completion is server-side, so changing browser or clearing local storage cannot repeat notebook creation. OAuth returns to the saved uses screen.

Account-local `onboarding_setup` stores the step, selected uses, live runtime check and created notebook IDs. Welcome leads to uses/connections, then review and one setup action. Starter proposals are derived from explicit choices and labelled as starters. No collection, notebook or deployed template is created until that review is accepted. Creation resumes by existing entity names, never renames or overwrites an existing notebook, and repeated completion is a no-op. The fresh default General is named Chief of Staff; returning accounts retain their existing identity.

The adopted local version names GN100 and does not request a cloud inference key. Check setup inspects the configured model route and performs a real managed agent turn. It records the successful job, not a simulated readiness flag. The cloud version names Nebius Cloud + Token Factory and exposes its key field; it has no local fallback. Users can continue with recording, notes and search while AI is unconfigured. Settings remains the place for model switching and route diagnostics.

The Learning choice seeds Learning Onshape with a plan and official guide links, a Steward and the functional Tutor. Other uses create named empty notebooks and appropriate shipped templates. Slides and scheduling are absent because they are not implemented. Connected-mail-derived proposals and reviewed source filing remain #393; this slice never labels starter notebooks as mail analysis.

The contextual tour starts only after accepted setup. It covers the library, Home, agents, Chat, agent settings, notes and an existing meeting, skipping missing targets. Local-storage tour progress is a convenience; account setup completion is authoritative. The tour no longer repeats welcome, keys or sample download setup.
