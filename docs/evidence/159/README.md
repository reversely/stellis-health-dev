# Chat: attached report panel and named citations

Issue: [#159](https://github.com/reversely/stellis-health-dev/issues/159). Date: 2026-10-24. Reference: [Ask with attached report](../../refs/stellis-demo/ask-with-attached-report.png).

## Change

- **Citation chips:** record links in agent replies render as chips named by source and page (*Fatigue laboratory investigation, p. 1*). The chip whose source is open is a colour block; the rest are quiet.
- **Document panel** (`chat-document.js`): notebook, title, type and pages, *Open PDF*, the visit or test date with its evidence line, health facts to check, and the page with flagged lines or the cited region highlighted, plus a caption naming the highlight. It opens from chips and attachment links on a plain click (modifier clicks still navigate), closes with the close button or Escape, and closes when leaving the chat. On wide screens the chat makes room and the agent context column steps aside; on phones it is a full-height sheet above the bottom navigation.
- **Facts:** `health_facts` adds `reference` and `range_status` from each quoted line (the parser moved there from the Brief). The compact facts view shows the count to check, status blocks, icon accept and reject, and tinted flagged rows. The document page also shows status blocks.
- **Attachments:** *Saved to <notebook>* with the notebook's colour dot, and a file icon.

## Evidence

- `tests/browser/chat_document.mjs` on `tests/browser/chat_document_server.py` (a seeded thread: saved attachment, a reply with three record links, four suggested facts). It covers chip names, the saved chip and its dot, opening from a chip without navigating, the selected chip, notebook and date evidence, *4 to check*, statuses by name, the flagged Ferritin row, the highlight and its caption, accepting a value (*3 to check*), closing to clear the chip, opening from the attachment and from another source's chip, and the dark desktop and dark phone layouts without overflow.
- `pytest`: 705 passed, 2 skipped; all JS unit tests pass; `ui_consistency` passes (50 checks).

## Limits

The reference names the laboratory under the title; documents do not store an issuer, so the panel shows type and page count. The reply in the fixture is seeded; real agent wording and link labels come from the agent.
