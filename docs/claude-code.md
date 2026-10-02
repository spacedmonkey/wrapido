---
tags:
  - agent-mode
  - claude-code
  - cli
---

# Claude Code skill

This repository ships a [Claude Code](https://claude.com/claude-code) skill, `wrapido`, that teaches Claude how to drive the CLI: to start in the `wp/v2` namespace and discover before acting, to always run in agent mode, how to authenticate with Application Passwords or OAuth2 (and to walk you through setting one up when a request needs it), `--per_page=-1` to fetch every item, bulk changes with several ids (batched through `/batch/v1`) and how to read partial failures, file uploads, how to keep output small, safety rules (drafts by default, confirm before deleting), and the common gotchas. It builds on [Agent mode](agent-mode.md) and [AGENTS.md](https://github.com/spacedmonkey/wrapido/blob/main/AGENTS.md), and is only knowledge: Claude still runs the real `wrapido` command, so the CLI must be installed too.

## 1. Install the CLI

Claude runs `wrapido` from your shell, so it needs to be on your `PATH`. `wrapido` isn't published to npm yet, so install it from source (see [Installation](installation.md) for details):

```sh
git clone https://github.com/spacedmonkey/wrapido.git
cd wrapido
npm install
npm run build
npm install -g .
wrapido --help
```

## 2. Install the skill

Pick one.

### As a plugin (recommended)

The repository is a Claude Code plugin and its own single-plugin marketplace:

```sh
claude plugin marketplace add spacedmonkey/wrapido
claude plugin install wrapido@wrapido
```

You can also run `/plugin` inside Claude Code. To pick up later changes:

```sh
claude plugin marketplace update wrapido
```

To try a local checkout instead of GitHub, add the folder: `claude plugin marketplace add ~/path/to/wrapido`.

### Copy the skill

For every project on your machine:

```sh
mkdir -p ~/.claude/skills
cp -r skills/wrapido ~/.claude/skills/
```

For a single project, copy it to that project's `.claude/skills/wrapido/` instead.

Restart Claude Code (or start a new session) afterwards. Run `/skills` to confirm `wrapido` is listed.

## 3. Give Claude credentials and a site

Use a WordPress [Application Password](authentication-application-passwords.md), exported in the shell you start Claude Code from, so the password never appears in the conversation, your shell history or the process list:

```sh
export WP_USERNAME=admin
export WP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

Put the site in a `wrapido.yml` in your project so Claude doesn't have to repeat `--url`:

```yaml
url: https://example.com
```

If the site uses the [OAuth2](authentication-oauth2.md) plugin instead, store a credential once with `wrapido auth oauth2 add` or `login`. If you skip this step, Claude asks which type you want and walks you through it the first time a request needs auth (drafts, private content, settings, any write, or a `401` error).

Agent mode switches on by itself inside Claude Code, so there is nothing else to configure. Check with `wrapido --debug`, which prints `agent mode: on (CLAUDECODE)`.

!!! warning "Project files are trusted input"
    A `wrapido.yml` in a repository you cloned can set `url`, and exported `WP_USERNAME`/`WP_PASSWORD` would be sent to that site. Run `wrapido config get` in an unfamiliar project first. The skill tells Claude to do the same.

## 4. Use it

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

## Other agents

The skill is Claude Code specific, but the knowledge isn't: [AGENTS.md](https://github.com/spacedmonkey/wrapido/blob/main/AGENTS.md) is the same guidance as a plain file for Codex, Cursor, Copilot, Cline and other tools that read it. See [Agent mode](agent-mode.md) for how each is detected.
