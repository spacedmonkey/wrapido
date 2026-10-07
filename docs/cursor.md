---
tags:
  - agent-mode
  - cli
---

# Cursor

The [`wrapido` skill](agent-plugins.md) installs as a plugin in [Cursor](https://cursor.com/docs/plugins). It teaches Cursor's agent to drive the `wrapido` CLI: discover the site's REST API first, run in agent mode, authenticate, page through everything, make bulk changes, upload files, and follow the safety rules.

## How it works

Cursor doesn't read Claude Code's plugin files, so the repository also carries two generated files:

- `.cursor-plugin/plugin.json`: the plugin manifest, with the logo.
- `.cursor-plugin/marketplace.json`: lets Cursor import the repository.

Both are generated from `.claude-plugin/`. The plugin's only content is the skill in `skills/wrapido/SKILL.md`, which Cursor's agent loads when a request is about a WordPress site.

## 1. Install the CLI

Cursor's agent runs `wrapido` from your shell, so it must be on your `PATH`. See [Installation](installation.md), then check with `wrapido --help`.

## 2. Install the plugin

Open **Customize** in the sidebar and import **From GitHub Repository**, entering `https://github.com/spacedmonkey/wrapido`. Then install `wrapido`, choosing project or user scope.

Check it under **Customize → Skills**, where `wrapido` is listed under **Agent Decides**. You can also type `/` in the agent chat and search for `wrapido`.

### Without the plugin

Cursor also loads plain skill folders. Copy `skills/wrapido` into a project's `.cursor/skills/` (or `.agents/skills/`). For every project, copy it into `~/.cursor/skills/` instead.

## 3. Agent mode

Agent mode switches on by itself in Cursor's agent, so there is nothing to configure. Check with `wrapido --debug --help`, which prints `agent mode: on (CURSOR_AGENT)`. See [Agent mode](agent-mode.md).

## 4. Credentials and a site

Export `WP_USERNAME`/`WP_PASSWORD` (an [Application Password](authentication-application-passwords.md)) in the environment Cursor starts from, and put `url: https://example.com` in a `wrapido.yml` in your project. See [AI agents → Credentials and a site](ai-agents.md#credentials-and-a-site), including the warning about `wrapido.yml` in cloned repositories.

## 5. Use it

Ask for WordPress work in plain language. For example:

- "List the five most recent draft posts."
- "Which custom post types and taxonomies does this site register?"
- "Create a draft post titled Hello World with this content: ..."

## Update or remove

Cursor refreshes imported marketplaces from GitHub; use the marketplace's **Refresh** button to pick up a new version straight away. Remove the plugin from **Customize**. If you copied the folder instead, update or remove it by hand.
