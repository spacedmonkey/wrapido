---
tags:
  - agent-mode
  - claude-code
  - cli
---

# Claude Code

The [`wrapido` skill](agent-plugins.md) installs as a plugin in [Claude Code](https://claude.com/claude-code). It teaches Claude to drive the `wrapido` CLI: discover the site's REST API first, run in agent mode, authenticate, page through everything, make bulk changes, upload files, and follow the safety rules.

## How it works

This repository is a Claude Code plugin and its own single-plugin marketplace (`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`). The plugin's only content is the skill in `skills/wrapido/SKILL.md`, which Claude loads when a request is about a WordPress site.

## 1. Install the CLI

Claude runs `wrapido` from your shell, so it must be on your `PATH`. See [Installation](installation.md), then check with `wrapido --help`.

## 2. Install the plugin

```sh
claude plugin marketplace add spacedmonkey/wrapido
claude plugin install wrapido@wrapido
```

You can also run `/plugin` inside Claude Code. To pick up later changes:

```sh
claude plugin marketplace update wrapido
```

To try a local checkout instead of GitHub, add the folder: `claude plugin marketplace add ~/path/to/wrapido`.

### Without the plugin

Claude Code also loads plain skill folders. For every project on your machine:

```sh
mkdir -p ~/.claude/skills
cp -r skills/wrapido ~/.claude/skills/
```

For a single project, copy it to that project's `.claude/skills/wrapido/` instead.

Restart Claude Code (or start a new session) afterwards. Run `/skills` to confirm `wrapido` is listed.

## 3. Agent mode

Agent mode switches on by itself inside Claude Code, so there is nothing to configure. Check with `wrapido --debug --help`, which prints `agent mode: on (CLAUDECODE)`. See [Agent mode](agent-mode.md).

## 4. Credentials and a site

Export `WP_USERNAME`/`WP_PASSWORD` (an [Application Password](authentication-application-passwords.md)) before starting Claude Code, and put `url: https://example.com` in a `wrapido.yml` in your project. See [AI agents → Credentials and a site](agent-plugins.md#credentials-and-a-site) for OAuth2 and other options, including the warning about `wrapido.yml` in cloned repositories. If you skip this, Claude walks you through it the first time a request needs auth.

## 5. Use it

Claude loads the skill on its own when you ask for something WordPress-related. You can also invoke it directly with `/wrapido`:

- "List the five most recent draft posts."
- "Create a draft post titled Hello World with this content: ..."
- "Upload `./cat.jpg` to the media library and set its alt text."
- "Which custom post types and taxonomies does this site register?"
- "Find posts missing a featured image."
- "Get the titles of all published posts." (uses `list --per_page=-1`)
- "Upload `./logo.png` and set it as post 12's featured image."

Claude goes straight to the `wp/v2` namespace for core content and will typically run `wrapido help <namespace> <route> <verb> --format=json` first to read the live schema, then run the real command with `--fields` to keep the output small. It creates content as `draft`, shows what will change before an `update` or `delete`, and asks before bulk or irreversible work.

## Permissions

Plugins can't grant permissions, so Claude Code prompts before every `wrapido` call by default. To allow the read-only commands without a prompt, add this to `.claude/settings.json` (one project) or `~/.claude/settings.json` (everywhere). Writes (`create`, `update`, `delete`, `generate`, `meta`) stay on a prompt:

```json
{
	"permissions": {
		"allow": [
			"Bash(wrapido help:*)",
			"Bash(wrapido config get:*)",
			"Bash(wrapido * list:*)",
			"Bash(wrapido * get:*)",
			"Bash(wrapido * exists:*)"
		]
	}
}
```

Patterns match the command text, so a read with flags before the verb (for example `wrapido --url=... wp/v2 posts list`) will still prompt.
