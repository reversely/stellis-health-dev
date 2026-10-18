---
name: worktrees
description: Create, use, merge, and clean up Git worktrees for Stellis changes while preserving other checkouts and uncommitted files.
---

# Stellis worktrees

Use this procedure when work on Stellis needs an isolated checkout or when a
merged worktree needs cleanup. It applies to the private `reversely/stellis-dev`
repository and its local worktrees. The public `reversely/stellis` repository is
a release target, not a development checkout.

## Before changing checkout state

- Inspect `git worktree list --porcelain`, the current branch and remote, and
  `git status --short --branch` in the affected checkouts. Check whether a
  worktree already exists for the task and reuse it when suitable.
- Keep the user's active checkout on its current branch. Do not switch it to
  `main` or another task branch to make room for work.
- Uncommitted and untracked files belong to whoever left them there. A merged
  commit does not make a dirty worktree disposable.

## Creating an isolated checkout

- Create a worktree only when the current checkout cannot safely hold the task.
  Start it from current `origin/main` after fetching, unless the task explicitly
  depends on another branch or uncommitted work.
- Put agent-created worktrees under the existing repository's
  `.claude/worktrees/` directory, using a short task name. Do not create a new
  sibling folder directly under `/Users/slee/Repos/`, and do not use `/tmp` as
  an untracked substitute for this convention.
- Record the worktree path and branch so cleanup is part of the same task.
  Keep generated artifacts in an appropriate existing location or ask where
  they belong; do not create a new repository sibling just to hold artifacts.

## Merge and cleanup

- Verify the task's required checks and merge through the repository's current
  PR convention. Confirm the merge before removing its worktree.
- Check the worktree's status again. If it is clean, remove it with
  `git worktree remove <path>`, delete its merged local branch with `git branch
  -d <branch>`, and run `git worktree prune`. Confirm the path is gone from
  `git worktree list --porcelain`.
- If the worktree contains uncommitted, untracked, or ignored user files, leave
  it in place and report what prevents cleanup. Never use `--force`, `git
  clean`, or a recursive delete to erase those files as routine cleanup.
- Do not remove unrelated worktrees merely because their HEAD is an ancestor
  of `main`; inspect their status and ownership first.

This skill governs checkout hygiene. It does not authorize delegation, merging,
publishing, or deleting user work beyond the task's existing authorization.
