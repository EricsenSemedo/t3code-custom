# Upstream Sync Automation

This fork uses scheduled sync PRs instead of merging upstream directly into `main`.

## Workflows

- `.github/workflows/sync-upstream.yml`
  - runs on a schedule and manual dispatch
  - fetches the configured upstream repo and branch
  - updates `bot/upstream-sync`
  - opens or refreshes a PR into `main`
- `.github/workflows/sync-policy.yml`
  - runs on sync PR activity
  - classifies changed paths with `scripts/sync-policy.ts`
  - applies policy labels
  - enables GitHub auto-merge only for low-risk PRs

## Required repository settings

Set these repository variables:

- `T3CODE_UPSTREAM_REPOSITORY`
  - upstream repository in `owner/repo` format
- `T3CODE_UPSTREAM_BRANCH`
  - usually `main`
- `T3CODE_UPSTREAM_SYNC_STRATEGY`
  - `merge` or `rebase`

Recommended values for this fork:

- `T3CODE_UPSTREAM_BRANCH=main`
- `T3CODE_UPSTREAM_SYNC_STRATEGY=merge`

## Recommended bot credentials

For sync PRs, use a GitHub App token instead of the default `GITHUB_TOKEN`. That keeps CI and follow-on workflows predictable.

Add these secrets:

- `SYNC_APP_ID`
- `SYNC_APP_PRIVATE_KEY`

If they are missing, the sync workflow falls back to `GITHUB_TOKEN`, but GitHub may suppress some follow-on workflow triggers created by that token.

## Policy behavior

Low-risk sync PRs receive:

- `upstream-sync`
- `automerge-safe`
- `agent-fix-allowed`

Protected-path sync PRs receive:

- `upstream-sync`
- `needs-human-review`

Protected paths currently include:

- `apps/desktop/**`
- `apps/desktop/scripts/**`
- `apps/desktop/package.json`
- `scripts/build-desktop-artifact.ts`
- `.github/workflows/release*.yml`
- shared branding config
- core provider/session routing files

## Auto-merge rules

Auto-merge is enabled only when both are true:

1. `scripts/sync-policy.ts` marks the PR as `automerge-safe`
2. required GitHub checks pass

GitHub performs the actual merge after branch protection requirements are satisfied.

## Manual review rules

Review sync PRs manually when they touch:

- desktop identity or updater logic
- release workflows
- session/auth/provider routing
- shared branding defaults or data-dir behavior

## Local policy test

Run:

```bash
node scripts/sync-policy.ts apps/web/src/main.tsx docs/release.md
```

Run:

```bash
node scripts/sync-policy.ts apps/desktop/src/main.ts .github/workflows/release.yml
```
