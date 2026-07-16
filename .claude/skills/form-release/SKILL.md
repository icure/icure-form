---
name: form-release
description: Use when releasing a new version of @icure/form to NPM and GitHub from this repo — "release icure-form", "publish a new version", "cut a release", "bump and publish".
---

# Releasing @icure/form

Publishes a new version to NPM and GitHub in one pass: preflight checks, version bump, release notes in WHATSNEW.md and RELEASES.md, tag, publish, GitHub release.

**Each step gates the next. If a step fails, stop and report — never continue past a failed check.**

**Remote name:** this repo's remote is `github`, not `origin` — use `github` in every fetch/push.

**Version lines:** this skill releases the 2.x line from `main` (the NPM `latest` dist-tag). The 3.x line is published from the `cardinal` branch and is NOT covered by this process — if asked to release 3.x, stop and discuss with the user first.

**Interactive prompts:** commits, tags and pushes are SSH-signed through the Secretive agent, which may refuse to sign from a non-interactive shell (`agent refused operation` / `Permission denied (publickey)`). If that happens, don't retry blindly: ask the user to run the exact same command with the `!` prefix so they can approve Secretive's prompt. Remote-only operations (deleting a tag/release) can alternatively go through `gh api`, which uses an HTTPS token and needs no SSH.

## 1. Preflight — everything pushed on main

```bash
git fetch github
git status --porcelain            # must be empty
git branch --show-current         # must be main
git rev-parse HEAD github/main    # must be identical
```

Any mismatch → stop and tell the user what differs (uncommitted files, unpushed commits, wrong branch).

## 2. Choose the new version

```bash
npm view @icure/form versions --json   # existing versions — the new one must NOT be in this list
git log --no-merges --format='%s' $(git describe --tags --abbrev=0 2>/dev/null || echo github/main~20)..HEAD
```

Historical tags are sparse, so `git describe` may point far back; the previous release's `target` commit in `RELEASES.md` is the reliable baseline for "commits since last release". Apply semver to those commits: bug fixes only → patch; new fields/features → minor; breaking schema or API changes → major. Propose the version to the user and get confirmation before proceeding. It must not exist on NPM and must be greater than the latest published 2.x version (ignore the 3.x versions in the list).

## 3. Bump and commit

Edit `"version"` in `package.json`, then:

```bash
git add package.json && git commit -m "Bumped version to <VERSION>"
BUMP_SHA=$(git rev-parse HEAD)
```

## 4. Draft release notes — WHATSNEW.md and RELEASES.md

Two files, two audiences:

**WHATSNEW.md** (only when the release has user-facing changes): insert a section at the TOP of the version list (right after the intro and first `---`), matching the existing style — feature-oriented prose with usage notes, YAML examples and README links:

```markdown
## <VERSION> (<YYYY-MM-DD>)

### <Feature headline>

<explanation, yaml example, link to README section>

---
```

**RELEASES.md**: append an entry at the END, in the exact format used by `scripts/create-releases.ts`:

```markdown
## [MISSING] <VERSION> (<YYYY-MM-DD>)
<!-- tag: <VERSION> | target: <BUMP_SHA> | prerelease: false -->

- <commit subject 1>
- <commit subject 2>
```

The `[MISSING]` marker is required: entries without a status marker are treated as already published and skipped by `create-releases.ts`. If a WHATSNEW.md section was written, reuse it as the RELEASES.md body (replace relative `./` links with absolute `https://github.com/icure/icure-form/blob/main/` links); otherwise use the deduplicated commit subjects, dropping version-bump/merge/noise commits. Prerelease versions (`-RC.x`, `-beta.x`) → `prerelease: true`.

Show the drafted entries to the user for review before continuing.

```bash
git add WHATSNEW.md RELEASES.md && git commit -m "Added release notes for <VERSION>"
```

## 5. Tag and push

Tags use the plain version, no `v` prefix (the recent convention — only ancient 1.0.x tags are `v`-prefixed), on the bump commit. `tag.gpgSign` is enabled in this repo, so tags are annotated and need a message — a bare `git tag <VERSION>` fails with "no tag message?":

```bash
git tag -m <VERSION> <VERSION> $BUMP_SHA
git push github main <VERSION>
```

## 6. Publish to NPM

The publish script starts with an interactive `npm login`, so it cannot run from a non-interactive shell. Ask the user to run it themselves:

```
! yarn run publish
```

It logs in, builds into `lib/` (`prepare`), and runs `npm publish --tolerate-republish --access public --tag latest` from `lib/`. The user completes the browser login and OTP flow.

Always verify before continuing: `npm view @icure/form@<VERSION> version` must return the version — a 404 means the publish did NOT complete, regardless of how much output was printed.

## 7. Create the GitHub release

```bash
bun scripts/create-releases.ts --only <VERSION>
```

It reads the RELEASES.md entry and creates the release on the pushed tag. Verify with `gh release view <VERSION> --repo icure/icure-form`. Then remove the `[MISSING] ` marker from the entry's header in RELEASES.md (no marker = published), commit (`Marked <VERSION> as released`) and push.

## Backfilling historical releases

`scripts/prepare-releases.ts` regenerates RELEASES.md from scratch for ALL versions on NPM: it resolves each version to a commit (npm gitHead → git tag → package.json bump commit), classifies existing GitHub releases as OK/TERSE/MISSING, and drafts descriptions (preferring the version's WHATSNEW.md section over generated commit lists). Review the generated file, then run `bun scripts/create-releases.ts` (optionally `--dry-run` first) to create everything marked `[MISSING]`. Warning: it overwrites RELEASES.md — don't run it after hand-editing entries you want to keep.

## Failure recovery

| Failed step                                         | Recovery                                                          |
|-----------------------------------------------------|-------------------------------------------------------------------|
| Git command: `agent refused operation`              | User runs the same command with `!` prefix and approves Secretive |
| `yarn run publish` login/OTP fails                  | User re-runs `! yarn run publish` and completes the flow; then verify with `npm view` |
| Build failure during publish                        | Fix the build issue; tag and notes are fine — retry publish only  |
| NPM publish succeeded but GitHub release (7) failed | Re-run step 7 only; never re-publish to NPM                       |
| Wrong version published                             | NPM versions are immutable — release a new patch, don't unpublish |
