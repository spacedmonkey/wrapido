---
tags:
  - agent-mode
  - cli
---

# Agent mode

**Agent mode** makes `wrapido`'s output easy for a program to read — an AI agent or a script — and changes nothing for people at a terminal. To set up an AI coding agent end to end (the CLI, the `wrapido` skill, credentials and a site), start at [AI agents](agent-plugins.md); this page is the reference for what agent mode itself does.

## Turn it on

Detected automatically from your environment — no setup needed inside:

-   Claude Code (`CLAUDECODE`)
-   OpenAI Codex (`CODEX_CI`, `CODEX_SANDBOX`, `CODEX_THREAD_ID`)
-   GitHub Copilot's agent tooling (`COPILOT_AGENT`, `COPILOT_ALLOW_ALL`)
-   Cline (`CLINE_ACTIVE`)
-   Cursor's agent/CLI terminal (`CURSOR_AGENT`)
-   Any tool following the cross-tool `AI_AGENT` convention

Not detected (e.g. a custom script, or a tool not listed above)? Set it by hand:

```sh
export WRAPIDO_AGENT=1
```

`WRAPIDO_AGENT` always overrides detection: `0`/`false`/`no`/`off` forces agent mode off (the escape hatch for a human working inside one of these tools' terminals), anything else non-falsy forces it on. `AI_AGENT` behaves the same way one level down — an explicit falsy `AI_AGENT` (e.g. `AI_AGENT=false`) also forces agent mode off, even if a more specific marker like `CLAUDECODE` is set.

Run with `--debug` to confirm: it prints `agent mode: on (CLAUDECODE)` or `agent mode: off`.

Note: VS Code's Copilot agent mode is reported to set no distinguishing environment variable (by design, to keep the agent's environment identical to a human's), so it may not be detected; use `WRAPIDO_AGENT=1` there.

## What changes

| Behaviour                                 | Normal                                                                                                          | With `WRAPIDO_AGENT=1`                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default `--format`                        | `table`                                                                                                         | `json` (a `format` in a [config file](configuration.md) or an explicit `--format` still wins)                                                                                                                |
| JSON layout                               | Indented                                                                                                        | Compact, one line                                                                                                                                                                                            |
| `_links` / `_embedded`                    | Kept                                                                                                            | Removed from json/yaml/raw output (kept if you name them in `--fields`)                                                                                                                                      |
| Colour                                    | On                                                                                                              | Off                                                                                                                                                                                                          |
| Spinners                                  | On                                                                                                              | Off; notices are plain lines on stderr                                                                                                                                                                       |
| Paging                                    | On, when stdout is a real terminal                                                                              | Always off                                                                                                                                                                                                   |
| Route discovery JSON                      | Raw OPTIONS response (`wrapido <ns> <route>`); `verbs` as a `"list, get, (subcommand)"` string                  | Same object as `help` (no bulky item `schema`; `endpoints[].required`, `children[]`); `verbs` as an array plus `has_children`                                                                                |
| Errors                                    | `Error: ...` text                                                                                               | JSON on stderr, for every error (including a bad `--format`): `{"error":{"message","code","status","params","hint"}}`                                                                                        |
| Partial failure (several ids, `generate`) | `#14: Error: ...` / `<id>: Error: ...` lines, `Not sent: ...`, a summary; stdout lists what succeeded; exit `1` | One JSON line per event on stderr: `{"error":{...},"index":14}` or `"id"`, `{"not_sent":[...]}`, `"outcome":"unknown"` / `"sent_individually"` for a whole batch; stdout is the JSON array of what succeeded |
| Unknown `--name=value`                    | Silently sent to the API                                                                                        | Warning on stderr, with a suggestion (`--per-page` → `--per_page`)                                                                                                                                           |

JSON is the default because it is the only format that is lossless for every command's output (nested objects, single items, schemas, errors). For a long, flat list, `--format=csv --fields=...` is roughly half the size; and `--fields` trimming matters far more than the format.

Data always goes to stdout and notices to stderr, so `2>/dev/null` gives clean data.

Paging (`less`/`$PAGER`) never engages under agent mode or when stdout isn't a real terminal — including every `execa`/subprocess invocation, piped output, and CI — regardless of `--no-pager`/config file settings, so scripted consumption of any `--format` is never affected.

## Works in any mode

These help agents but are available to everyone:

-   `wrapido help <namespace> <route> [<verb>] --format=json` — structured schema (args, types, enums), scoped to the verb's HTTP method.
-   `--format=json` prints errors as JSON.
-   `help ... --format=json` includes each endpoint's `required` arg names and the route's nested `children`.
-   `--fields=id,_embedded` also asks WordPress for `_links` (needed for `--_embed` to work).
-   `list --format=count` prints the site total (from `X-WP-Total`); when more pages exist, stderr says `Page 1 of N (T total)`.
-   `list --per_page=-1` returns every page at once, requesting the route's maximum page size each time; if the route's schema doesn't declare both `page` and `per_page` (often because it declares no args at all), `-1` is instead forwarded to the API literally, with a notice on stderr.
-   An unknown route exits `1` with `No such route`, and a bare unknown namespace with `No such namespace` (in agent mode this also applies when a verb is given).
-   `--fields=id,title.rendered` keeps nesting in JSON/YAML.
-   `types`, `taxonomies` and `statuses` list one row per entry.

## For the agent

[AGENTS.md](https://github.com/spacedmonkey/wrapido/blob/main/AGENTS.md) is the same guidance as the `wrapido` skill, written for the agent itself as a plain file. Credentials and headless authentication are covered in [AI agents → Credentials and a site](agent-plugins.md#credentials-and-a-site).
