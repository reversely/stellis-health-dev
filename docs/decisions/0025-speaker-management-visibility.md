# ADR 0025: Speaker management and tag-list visibility

Status: accepted for the development browser workflow, 2026-10-16.

## Context

The observed Otter Tag picker is compact, while Manage Speakers opens a separate searchable modal with rename, hide, and merge actions. Stellis already stores confirmed `Person` records separately from provisional acoustic groups and has Person rename/merge routes. The earlier inline editor mixed group labeling, Person confirmation, and transcript edit mode.

## Decision

Manage Speakers lists confirmed Person records and active manual names from this recording. Its search, inline rename, hide/show, and two-person merge use the existing Person identity boundary. Manual names are marked **This recording**; they can be renamed locally or explicitly tagged as a Person, after which hide and merge become available. Hiding sets nullable `persons.hidden_at`; it removes the Person from tag suggestions but keeps its transcript labels, links, profile, and search history. The modal can still show hidden records so the user can restore them. A merge requires selecting two People and explicitly choosing which identity to retain; the existing transactional Person merge moves links and deletes the source Person. An `Edit this passage` control retains the detailed segment/group correction path outside the default picker.

The picker offers Untag for a current confirmed Person or manual label. Confirmed-Person untag uses the existing source-passage unlink route; manual-label untag clears that label. Manage Speakers is available from the picker without changing transcript word-edit mode.

## Limits

An acoustic cluster is a provisional voice grouping, not a Person. This modal does not merge or hide raw acoustic clusters. A hidden Person can still be found on their profile or in existing transcripts. Hiding is local development state; future encrypted sync must represent it in a versioned Person record. Otter's internal hide semantics are unknown, so the Stellis behavior is explicit in the interface and API.
