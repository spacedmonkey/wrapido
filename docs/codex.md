---
tags:
  - agent-mode
  - cli
---

# OpenAI Codex

The [`wrapido` skill](agent-plugins.md) installs as a plugin in [OpenAI Codex](https://developers.openai.com/codex) (the CLI, the IDE extension and the app). It teaches Codex to drive the `wrapido` CLI: discover the site's REST API first, run in agent mode, authenticate, page through everything, make bulk changes, upload files, and follow the safety rules.

## How it works

- **Plugin list:** Codex reads the plugin list from this repository's `.claude-plugin/marketplace.json`.
- **Plugin manifest:** it reads the plugin itself from `.codex-plugin/plugin.json`. That manifest is generated from the Claude Code one (`.claude-plugin/plugin.json`) and adds what Codex's plugin browser shows: a display name, a category, the logo and example prompts.
- **Content:** the plugin's only content is the skill in `skills/wrapido/SKILL.md`, which Codex loads when a request is about a WordPress site.

## 1. Install the CLI

Codex runs `wrapido` from your shell, so it must be on your `PATH`. See [Installation](installation.md), then check with `wrapido --help`.

## 2. Install the plugin

Add the repository as a plugin marketplace, then add the plugin from it:

```sh
codex plugin marketplace add spacedmonkey/wrapido
codex plugin add wrapido@wrapido
```

Or, after adding the marketplace, open `/plugins` in a Codex session and install `wrapido` from there.

Check it with `codex plugin list`. In a session, `/skills` lists the loaded skills, and you can mention it directly with `$wrapido`.

### Without the plugin

Codex also loads plain skill folders. To use the skill in one project without installing a plugin, copy `skills/wrapido` into that project's `.agents/skills/`. For every project, copy it into `~/.agents/skills/` instead.

## 3. Agent mode

Agent mode switches on by itself inside Codex, so there is nothing to configure. Check with `wrapido --debug --help`, which prints `agent mode: on (CODEX_...)`. See [Agent mode](agent-mode.md).

## 4. Credentials and a site

Export `WP_USERNAME`/`WP_PASSWORD` (an [Application Password](authentication-application-passwords.md)) before starting Codex, and put `url: https://example.com` in a `wrapido.yml` in your project. See [AI agents → Credentials and a site](ai-agents.md#credentials-and-a-site), including the warning about `wrapido.yml` in cloned repositories.

Codex runs commands in a sandbox. If `wrapido` can't reach your site, allow network access for the session (see Codex's sandbox and approval settings).

## 5. Use it

Ask for WordPress work in plain language, or start from one of the plugin's suggested prompts. For example:

- "List the five most recent draft posts on my WordPress site."
- "Create a draft post titled Hello World."
- "Which custom post types and taxonomies does this site register?"

## Update or remove

| | Command |
| --- | --- |
| Update | `codex plugin marketplace upgrade wrapido` (refreshes the marketplace from GitHub) |
| Disable | `/plugins`, select `wrapido`, press Space |
| Remove | `codex plugin remove wrapido`, then `codex plugin marketplace remove wrapido` |
