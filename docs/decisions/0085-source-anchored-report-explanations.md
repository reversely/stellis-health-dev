# Source-anchored report explanations

Date: 2026-10-24. Status: accepted implementation for #148, scoped from #147.

The user wants to point at their original report and ask Stellis to explain it in context. Preserve the original page as the primary interface. OCR correctness review supports that interaction but does not define it.

Use immutable, versioned source maps with normalized line geometry and account-local conversation history. Resolve selection against server-owned region IDs. Keep the original document/page revision and source byte digest, engine identity and selected region alongside saved explanations. Model-generated screen coordinates are insufficient as citations. Browser zoom/rotation transform the page and hit targets together.

Use the existing bounded local rendering and recognition dependencies for the first adapters: PyMuPDF text geometry and Tesseract TSV. This permits a complete source-selection workflow before evaluating larger OCR pipelines. New engines must produce the same normalized contract and undergo the separately planned license/hardware/quality evaluation. No new vendor or model dependency is introduced here.

Each question uses a fresh gateway session with explicit selected-region history and current sources. Retrieve up to three related page excerpts inside the account, preserving headings and nearby rows. Server validation checks source marker IDs and rechecks revisions/digests inside a write transaction before saving. It does not certify that an AI interpretation follows clinically from the citation. Changed/deleted related evidence marks historical exchanges stale; deleting the original report removes its maps and exchanges.

The first surface supports recognized text lines. Chart points, arbitrary crops, word-level table reconstruction, voice input and comprehensive retrieval across non-document health data remain future work. [Evidence and reproduction](../evidence/148/README.md) distinguish real geometry/storage/browser checks from controlled model responses and unverified live inference quality.
