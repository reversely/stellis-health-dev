# RFI 91 sample answer key

This is a fictional consulting case. Every project, person, message, recording, and document in the case is sample data. The Water Treatment notebook owns the case; the three other notebooks provide distinct projects for routing exercises.

| Question | Supported answer | Fixture evidence |
| --- | --- | --- |
| When did RFI 91 open? | 2026-09-28. | `mail:sample-rfi91-open`; `page:status` |
| What keeps it open? | The revised isolation valve schedule and a material certificate traceable to the proposed valve are needed before engineering can approve closure. | `mail:sample-rfi91-block`; `page:spec`; `passage:rfi91-2`; `note:meeting` |
| Which meeting changed the target? | The 2026-10-10 coordination meeting moved the response target from 2026-10-11 to 2026-10-22. | `mail:sample-rfi91-deadline`; `page:status`; `passage:rfi91-3` |
| What remains uncertain? | Whether vendor certificate C316 satisfies specification WT-04 revision B. | `mail:sample-rfi91-block`; `page:spec`; `passage:rfi91-5` |
| What may a reply say? | The package is under engineering review. Do not promise RFI closure before engineer sign-off. | `mail:sample-rfi91-deadline`; `passage:rfi91-5`; `note:meeting` |

`passage:rfi91-N` identifies segment `rfi91-N` in `rfi91_audio.json` and the matching audio. The sample mailbox exposes the mail IDs through its Gmail-shaped `search_threads` and `get_thread` tools. The case can be added and reset independently of a user's other workspace items.
