---
name: fix-ci
description: Watch the GitHub checks for the commit just pushed and, when they fail, read the logs, fix the cause, push, and repeat until green. Use right after a `git push` or `gh pr create` (a hook reminds you), or when the user says "fix CI", "make the checks pass", "why is CI red".
---

# Fix CI until green

Fully automatic: never ask the user whether to continue. Stop only on green, on a cap below, or when something is genuinely blocked.

## 1. Find the run

- If `gh pr view --json url` finds a PR for this branch, run `gh pr checks --watch`.
- Otherwise run `gh run list --commit "$(git rev-parse HEAD)" --json databaseId,status,conclusion,workflowName`, then `gh run watch <id> --exit-status` for each run.
- A run can take a few seconds to register after a push. If nothing shows up, wait about 15 s and retry, up to 3 times.
- If there is still no PR and no run, stop silently. `ci.yml` runs only on PRs and `main`, so `gh pr create` fires the hook again later.
- Watching can take minutes. Run watch commands with Bash `timeout: 600000` (the maximum), or with `run_in_background` for longer runs, and wait for the notification.

## 2. Green

Every check passes: report the PR URL and the final status, then stop.

## 3. Red: find the cause

1. Run `gh run view <id> --log-failed` and keep only the failing step's output.
2. Reproduce locally with the matching script, such as `npm run typecheck`, `lint`, `lint:md:docs`, `lint:pkg-json`, `check:plugins`, `test`, or `coverage`.
3. Fix the root cause. Never skip, delete, or weaken a test or lint rule to get green.
4. Re-run the failing script, then `npm run typecheck && npm run lint && npm test`, until all pass.

## 4. Push

1. Check that `git branch --show-current` isn't `main`.
2. Check `git status`. Stage only the files you changed for this fix.
3. Commit with a Conventional Commit, such as `fix(ci): <what broke> (round <n>)`, with the attribution trailer. The round number lets you recount the cap.
4. Run `git push`. The hook fires again, which starts the next round.

## Stop and report what's left when

- 5 fix rounds have been pushed and checks are still red.
- The same failure comes back unchanged after a fix.
- The failure isn't in the code: flaky infra, a missing secret, a quota, or a GitHub outage. First rerun once with `gh run rerun <id> --failed`.

## Never

- Force-push, `git commit --amend` a pushed commit, or push to `main`.
- Merge the PR.
