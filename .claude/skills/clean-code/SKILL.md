---
name: clean-code
description: >-
  Writes code that stays simple, modular and cheap to load: data structures matched to the access
  pattern, side effects at the edges, heavy imports deferred, why-comments at non-obvious choices,
  terse Google-style docstrings without history, and pre-commit hygiene where no hook runs. Use
  while writing or editing code in any language; /simplify audits a diff afterwards.
---

# Clean code

## Writing

- **Complexity:** match a data structure's cost to its access pattern (set or dict lookup, not a
  nested linear scan). An already-linear loop needs no hand-tuning.
- **Modularity:** I/O (file, network, database) lives in thin boundary functions; transformation
  and business logic stay pure and separately testable.
- **Load time:** import a heavy library inside the function that needs it when the module loads
  on paths that never use it. A CLI imports only what the invoked subcommand needs.
- **Why-comments:** comment the why at a non-obvious algorithm or data-flow shape.
  Anything larger than a local choice gets the same explanation in the commit body.
- **Docstrings:** Google style, describing current behavior.
- **Hygiene, where no pre-commit hook runs:** no secrets, tokens or credentials; no debug prints or
  commented-out code; no dead code or unused imports; no large binaries or generated artifacts; no
  merge-conflict markers; formatting left to the formatter.
- **New dependencies:** adding a package, vendoring a repository or calling a new external API is
  the user's choice under the global CLAUDE.md.
- **Prompts and tool descriptions:** full, specific sentences, never fragments. When a small model
  misbehaves, enforce the rule in code (validation, a precondition, a fixed reply) instead of
  rewording until one run passes.
- **Naming:** PEP 8 and Google Python Style Guide naming, even where the surrounding code departs
  from them.

## Committing
- Write git commit messages in Conventional Commits form: type, optional scope, an imperative
```
<type>(<scope>): <subject>

<body>

<footer>
```
- Type and subject are required; scope, body and footer are optional.
- No assistant attribution in any repo (no `Co-Authored-By` naming the model, no
  session link). The repo's own required trailers (ticket-close lines, sign-offs) still apply.