---
name: ship-issue
description: Turn an approved plan into a GitHub issue, then implement it on its own branch and open a PR that fixes it. Use right after a plan is approved (a hook reminds you), or when the user says "ship this plan", "implement #42", "fix issue 42", "work on issue 42".
---

# Ship an issue: plan → issue → branch → PR

Every change is made in the open: the issue (holding the full plan) exists **before** any code is written. After the user approves a plan there are no more stops — run every step below without asking, unless something is genuinely blocked.

Skip the whole skill if the approved plan or the user says "no issue" (e.g. pure research or a question).

## 0. File the issue (when no issue number was given)

1. Write the approved plan to a scratch file with these headings: `## Context`, `## Approach`, `## Files to change`, `## Verification`, `## Out of scope`, and a final line `Experimental: yes|no` (see CLAUDE.md's Workflow section).
2. Labels: run `gh label list --limit 100` and pick from what exists — never invent one.
   - One type label: `bug`, `enhancement`, `documentation`, `chore`, `refactor`, `test`, or `ci`.
   - Every matching `area: *` label.
   - `experimental` if it's opt-in behind `WRAPIDO_EXPERIMENTAL`.
3. Milestone: use the one the user picked during planning (it's in the approved plan). If none was picked, use the lowest open semver milestone:
   - List titles with `gh api repos/{owner}/{repo}/milestones --jq '.[].title'`.
   - Skip non-`X.Y.Z` titles and sort the rest with `sort -V`.
   - If none is open, create the next minor after the highest milestone, open or closed, with `gh api repos/{owner}/{repo}/milestones -f title=X.Y.0`.
4. File it with `gh issue create --title "<imperative summary>" --body-file <file> --label <a>,<b> --milestone <X.Y.Z>`.

## 1. Read the spec

Run `gh issue view <N> --json state,title,body,labels,milestone`. The body is the spec.
- Stop if the issue is closed.
- If a branch for it already exists (`git ls-remote --heads origin '*/<N>'`) or `gh pr list --state open --search "Fixes #<N> in:body"` finds a PR, continue that work instead of starting over: run `git switch <branch>` and skip step 2.

## 2. Branch

1. Stop if `git status --porcelain` shows uncommitted changes.
2. Run `git fetch origin && git switch --no-track -c <prefix>/<N> origin/main`. This works inside `.claude/worktrees` too, where `main` is checked out elsewhere.
3. Pick `<prefix>` from the issue's type label:

   | Type label | Prefix |
   | --- | --- |
   | `bug` | `fixes` |
   | `enhancement` | `feat` |
   | `documentation` | `docs` |
   | otherwise | the label itself (`chore`, `refactor`, `test`, `ci`) |

   For example `fixes/123` or `feat/567`, with no slug.

## 3. Implement

- Follow CLAUDE.md: the agent-mode checklist, doc updates, and JSDoc.
- Use the domain skills (`add-cli-verb`, `add-meta-subcommand`, `extend-fixture-server`).
- If the issue says `Experimental: yes`, gate the feature behind `WRAPIDO_EXPERIMENTAL` as CLAUDE.md's Workflow section describes.

## 4. Check

Run `npm run typecheck && npm run lint && npm run lint:md:docs && npm test` and fix until all of them pass.

## 5. Review

1. Run `git add -A`, then the `code-reviewer` agent. Tell it to review `git diff --staged`, so new files are included.
2. Fix CRITICAL and WARNING findings, then repeat step 4.

## 6. Commit and push

1. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - Subject: `<type>(<optional area>): <imperative summary>`. `<type>` is `feat`, `fix`, `docs`, `chore`, `refactor`, `test` or `ci`, matching the branch (a `fixes/` branch uses `fix`).
   - Body: why the change was made, if that isn't obvious.
   - Footer: `Refs #<N>`, then the attribution trailer.
   - Breaking change: put `!` after the type and add a `BREAKING CHANGE:` footer.
2. Check that `git branch --show-current` isn't `main`, then run `git push -u origin HEAD`.

## 7. Open the PR

Run `gh pr create --title "<conventional commit subject>" --body-file <file> --label <issue labels> --milestone <issue milestone>`. For the labels, use step 1's output joined with `--jq '[.labels[].name]|join(",")'`; for the milestone, use its title. The PR is ready for review, not a draft.

Fill the body from `.github/PULL_REQUEST_TEMPLATE.md`:
- `Fixes #<N>` on the first line.
- **How this fixes the issue:** map each problem or plan item in the issue to the change that addresses it, and list anything deferred.
- **How this was tested.**
- The checklist, ticked.
- The PR attribution line.

## 8. Wait for CI

`gh pr create` fires a hook that starts the `fix-ci` skill (`.claude/skills/fix-ci/`). Follow it until the checks are green or it hits a cap, then report the PR URL and the final check status.

## Never

- Commit or push on `main`.
- Force-push or `git commit --amend` a pushed commit.
- Merge the PR.
- Edit or close other issues.
