# ADR 0045: One durable Person per normalized name

Status: accepted, 2026-10-16.

## Context

Ticket #139 made Tag, Create, and Rename reuse a Person after collapsing whitespace and casefolding the name under a serialized SQLite write. The user requires that the same person cannot be labeled multiple times. The `persons` table still had no durable uniqueness constraint, leaving a future direct write path or an older database free to contain duplicate identities.

## Decision

`persons.name_key` stores the whitespace-collapsed, Unicode-casefolded name. Create, Tag, and Rename write it in the same transaction as the display name. A unique SQLite index rejects a second row with the same key; required-key triggers prevent a write path from omitting the key on migrated databases. Hidden profiles participate in the same identity space, so hiding a Person cannot make its name available for a second identity.

On opening a legacy database without keys, the schema migration chooses a visible Person first, then the oldest ID for a shared name. It moves every `person_links` row to that keeper before removing duplicate Person rows. It does not change transcript text, speaker labels, source times, or other confirmed people. The migration runs before the database connection is exposed to API handlers. Existing Person URLs pointing to removed duplicate IDs do not redirect; the retained ID is the stable identity going forward.

This is an exact normalized-name invariant. Different spellings or aliases for one human still need an explicit Person merge and acoustic evidence; software cannot infer that they are the same person from a name alone.

## Verification

Tests cover repeated Tag/Create reuse, Rename conflict, database rejection of duplicate or missing keys, and migration of active and hidden legacy duplicate rows without losing links. A temporary backup of the real interview database migrated with no duplicate keys or foreign-key errors; Jay Matlock remained one Person with 74 original links. In a separate browser clone, Tag reused that ID, after which the persisted index and picker still showed one Jay on reload. The clone was removed after validation.
