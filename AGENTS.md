# Delivery

Commit completed changes and push them to `main` by default after validation.
Preserve unrelated local work when preparing commits.
Deploy only when the user explicitly requests deployment.

# Evidence

Store validation artifacts under `docs/evidence/<ticket-number>/` (use a named subdirectory for follow-up revisions). Every evidence README must link the owning GitHub ticket and the relevant brief/demo references, and state what was actually validated. Include the ticket number in delivery commits. Preserve earlier evidence when adding a correction.
