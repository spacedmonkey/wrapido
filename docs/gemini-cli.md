---
tags:
  - agent-mode
  - cli
---

# Gemini CLI

The [`wrapido` skill](agent-plugins.md) installs as an extension in [Gemini CLI](https://geminicli.com). It teaches Gemini to drive the `wrapido` CLI: discover the site's REST API first, run in agent mode, authenticate, page through everything, make bulk changes, upload files, and follow the safety rules.

## How it works

- **Manifest:** Gemini CLI installs the repository as an extension, described by `gemini-extension.json` at its root. That file is generated from the Claude Code manifest (`.claude-plugin/plugin.json`) and holds only the name, version and description.
- **Skill:** Gemini finds the skill in `skills/wrapido/SKILL.md` by itself.
- **No context file:** the extension deliberately ships no `GEMINI.md`, so nothing is added to sessions that have nothing to do with WordPress. The skill loads only when a request needs it.

## 1. Install the CLI

Gemini runs `wrapido` from your shell, so it must be on your `PATH`. See [Installation](installation.md), then check with `wrapido --help`.

## 2. Install the extension

```sh
gemini extensions install https://github.com/spacedmonkey/wrapido --ref=main
```

Keep `--ref=main`. Without it, Gemini installs from the repository's latest GitHub release. The only file attached to that release is the npm package, which isn't an extension archive, so the install fails.

Add `--auto-update` to keep it up to date by itself.

Check it with `gemini extensions list`. In a session, `/skills list` should show `wrapido`. Agent Skills are on by default (`skills.enabled`).

## 3. Turn on agent mode

Gemini CLI sets no environment variable that `wrapido` detects, so export `WRAPIDO_AGENT=1` in the shell you start `gemini` from:

```sh
export WRAPIDO_AGENT=1
```

Check with `wrapido --debug --help`, which prints `agent mode: on (WRAPIDO_AGENT)`. The skill also tells Gemini to prefix its commands with `WRAPIDO_AGENT=1` if it sees `off`. See [Agent mode](agent-mode.md).

## 4. Credentials and a site

Export `WP_USERNAME`/`WP_PASSWORD` (an [Application Password](authentication-application-passwords.md)) before starting Gemini, and put `url: https://example.com` in a `wrapido.yml` in your project. See [AI agents → Credentials and a site](ai-agents.md#credentials-and-a-site), including the warning about `wrapido.yml` in cloned repositories.

## 5. Use it

Ask for WordPress work in plain language. For example:

- "List the five most recent draft posts."
- "Find posts missing a featured image."
- "Upload `./logo.png` and set it as post 12's featured image."

## Update or remove

| | Command |
| --- | --- |
| Update | `gemini extensions update wrapido` |
| Disable | `gemini extensions disable wrapido` |
| Remove | `gemini extensions uninstall wrapido` |
