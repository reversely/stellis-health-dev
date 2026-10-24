# Notebook Ask layout correction

User feedback: the #160 screenshot is misaligned and fails the original brief. Status: implemented and browser verified.

Compared the supplied `../160/notebook-ask-1440-light.png` with `../../refs/stellis-demo/notebook-ask-sources-viewer.png` and the layout brief in `../../../plans/r-04-notebook-sources.md`.

Observed gaps: summary tiles displace the workspace, the 368px sidebar and fixed 400px viewer squeeze the answer, panels have inconsistent surfaces and alignment, and the sticky composer covers the citation check and follow-ups.

Changes: remove notebook summary tiles and their mount call, enforce the intended compact sidebar, balance the three columns, align paper panels, use the inverted question bubble with readable text, keep the composer after the answer, and leave the viewer's record link above phone navigation. Existing source actions, selection, citations, trace, save, include, and upload remain available.

Validation: `tests/browser/notebook_ask.mjs` passes with the isolated report fixture. It checks aligned panel tops, at least 440px of answer space at 1440px, composer below messages, viewer layout at 1440/1280/390px in both themes, no horizontal overflow, and no page errors. It also exercises include and ask again, Add from, citation viewer, and report upload. Screenshots capture all six viewer states and both phone chat states. The 18 notebook chat/items Node tests pass.

The model reply is deterministic in this fixture. These screenshots validate layout and interactions, not medical answer quality or full visual parity with the richer reference content.
