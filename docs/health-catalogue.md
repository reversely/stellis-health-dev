# Health collections and notebook selection

The health catalogue gives each standard notebook a stable template ID and an approved parent collection. People choose notebooks in Add Notebook or during setup. The catalogue contains the 32 approved collection names and their four groupings in `src/stellis/health_catalogue.json`. Each collection has a scope, inclusion rules, overlap rules and concepts. Each template has a description, inclusion and exclusion rules, capabilities and version.

The same configuration stores the MedlinePlus source URL and exact attribution. Add Notebook displays the attribution after onboarding as well as during selection. The taxonomy is a product adaptation; updates to MedlinePlus do not change saved organization.

## Recommendations and approval

The existing intake agent extracts editable notes. A deterministic matcher recommends registered templates from Goals, ongoing Conditions, Care team and Reminders. Goals rank first. Literal note excerpts accompany each recommendation and are retained with newly activated templates. Historical, negated, family-only and unconfirmed statements are excluded conservatively. Matching records can accompany a recommendation; record titles alone do not activate new notebooks. People can search the entire catalogue when matching misses their wording.

Catalogue browsing, recommendations and activation add no provider call or package. Records sorting retains its existing model call but accepts new standard names only when they resolve to a registered template. Existing notebook names remain valid. Sorting creates nothing until approval and adds shared associations rather than moving records.

A recommendation is a proposal. The server resolves display names from registered IDs. Selection is atomic and idempotent; selecting a template again preserves its renamed title and collection. Custom notebooks keep their title and description. Settings supports collection reassignment, features and archiving. Add Notebook restores archived notebooks. Deletion preserves source records.

Setup saves the reviewed selection in account-scoped state. Review keeps each user's title, inclusion choice, collection, goal, source choices and task setting across reload and Back. Reopening setup starts a new selection without removing saved notebooks.

## Shared data

`notebook_record_links` adds many-to-many associations to existing documents, conversations and notes. The existing primary notebook fields remain compatible with imports, recording destinations and explicit Move actions. Listing, notebook source selection, chat retrieval, contextual search and timeline queries include additional links. Global records and clinical facts retain their original identity. Removing a notebook removes its links rather than its records. Existing notebooks and collections are preserved during migration, including ungrouped legacy notebooks; opening settings lets a person choose an approved collection.

## Capabilities

Core capabilities are sources, notes, contextual chat and search. The notebook health view projects accepted facts and dated sources from the same shared data. It shows Timeline when dated sources exist and Measurements when accepted facts map to registered measures. Settings stores explicit preferences for optional views. Disabling a view does not remove data. Existing check-ins remain subject to the notebook's task setting.

The registry also names care schedules, intervention history, progression and specialized assessments with their prerequisites. Progression requires a registered journey. Specialized assessments require a registered validated assessment. This change does not invent assessment formulas or infer a diagnosis from selecting a notebook. Calendar functionality remains in the existing calendar integration; the new notebook view does not fetch calendar providers or activate a new care-schedule view.

## Optional CLM backend

CLM-v0.1-8B could rank the same registered candidates behind the recommendation interface. It would need accuracy and calibration checks on labelled onboarding cases, a hosting decision and latency measurements. CLM would not define names, write source explanations or approve notebook creation. This implementation does not install, call or require CLM.

## Verification scope

Synthetic examples verify selection, privacy boundaries and data relationships. They do not establish clinical classification accuracy. The conservative matcher can miss synonyms and complex negation. The complete catalogue and custom creation remain available, and people approve every notebook.
