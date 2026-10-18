# Publishing Stellis

The private development repository is `reversely/stellis-dev`. The public source
repository is `reversely/stellis`. Publish reviewed versions manually from the
private repository's **Publish public release** GitHub Actions workflow.

1. Merge the release contents into the private repository's `main` branch.
2. Review `docs/releases/<version>.md` and keep the version in `pyproject.toml`
   and `package.json` aligned.
3. Run `python3 release/build_public.py OUT --test` from the release commit.
   Review the exported file list and scan results. The public repository receives
   only this exported tree, with one commit per release; private history and
   internal notes are excluded.
4. Confirm that `reversely/stellis` is public and that the private repository
   has a `PUBLIC_REPO_TOKEN` Actions secret with write access to it.
5. Dispatch **Publish public release** on the private repository's `main` with
   the version number. The workflow builds, scans, and tests again, then pushes
   the tree and `v<version>` tag and creates the GitHub release from the notes.
6. Check the public repository's file tree, tag, release notes, and fresh-clone
   install instructions. Do not change its visibility or publish the private
   repository itself.

The workflow rejects a run from any repository other than `reversely/stellis-dev`
and rejects a target that is private or is the source repository. A failed build
or scan stops before the public push. If a push succeeds but release creation
fails, create the GitHub release for the existing tag from the reviewed notes;
the workflow intentionally refuses to republish an existing tag.
