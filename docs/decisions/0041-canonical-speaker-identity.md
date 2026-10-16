# ADR 0041: One saved identity for each tagged speaker

Status: accepted, 2026-10-16.

## Context

The real interview contained 74 manual passage labels named Jay Matlock but no Jay Person. The transcript and index displayed the name, while the picker and Manage Speakers listed it repeatedly. The earlier index fix only reconciled display names and missed identity persistence.

## Decision

Tag writes a Person link. Person creation and naming compare collapsed whitespace and casefolded names under an immediate SQLite write transaction, so repeated API requests reuse the existing identity and renaming to another identity's name fails. Confirming a name promotes every active manual passage or cluster label with that name in the conversation to the same Person, preserving links to a different confirmed Person. The promotion removes those manual labels after creating the links. A manual passage tag keeps passage scope when confirmed; other picker group tags retain their existing group scope. Picker and Manage Speakers deduplicate any legacy manual name until it is promoted. Positive index shares below half a percent display as `<1%`.

The Person table has no database expression constraint for Unicode casefold and collapsed whitespace. All product Person writes go through the serialized API path. Direct external SQLite writes remain outside this guarantee.

The detailed passage editor also tags through the Person-link API, without a separate Create person request that could leave an orphan profile. Manage Speakers offers Tag for a legacy manual name; after promotion, Rename is available on the saved Person. The non-null manual-label API remains for older clients and technical overlays, but the browser no longer offers a parallel manual-name save action.

## Verification

The regression recreates 74 legacy Jay labels and one separately confirmed Shereen passage. One Tag request yields one Jay Person, 74 Jay links, no Jay manual labels, and the Shereen link intact. Repeated Tag and Create person calls with case and spacing changes reuse Jay; a conflicting rename is rejected. A fresh API client returns the Person ID on every Jay passage.

In Chromium on the actual 57:49 interview, the picker showed one Jay option before Tag. Tag promoted 74 Jay passage labels to one saved Person. After reload, the picker and Manage Speakers each showed one Jay row; direct SQLite and transcript projection checks showed 74 Jay links, zero unresolved Jay passages, and Shereen preserved. Otter's inspected CIFAR interview showed one Jay row and one Untag action in its picker, and one Jay row in Manage Speakers; its internal storage is unknown.

A separate 390-pixel Chromium fixture entered Jay through Manage Speakers → Edit this passage. The editor showed one Tag action and did not enter transcript Edit mode. Reload showed one Jay picker option and one persisted Person link. Two legacy Sam labels appeared as one Manage Speakers row with Tag; activating it created one Sam Person, two links, and no manual labels. The fixture database contained exactly one Jay and one Sam Person.
