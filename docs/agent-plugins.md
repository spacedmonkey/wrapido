---
tags:
  - agent-mode
  - claude-code
  - cli
---

# AI agents

AI coding agents (Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI, Cursor and others) can use `wrapido` to explore a WordPress site's REST API and build content with it. Two pieces make that work, and they're independent:

- **[Agent mode](agent-mode.md)** changes how the CLI _talks_: compact JSON output, JSON errors and warnings for unknown flags, with no colour or spinners. It turns itself on inside most agents and changes nothing for people at a terminal.
- **The `wrapido` skill** changes what the agent _knows_. It's packaged as a plugin for each tool, and teaches the agent to:
    - start in the `wp/v2` namespace and discover the API before acting;
    - always run in agent mode;
    - authenticate with Application Passwords or OAuth2, and walk you through setting one up when a request needs it;
    - fetch every item with `--per_page=-1`;
    - make bulk changes with several ids (batched through `/batch/v1`) and read partial failures;
    - upload files;
    - keep output small;
    - follow the safety rules (drafts by default, confirm before deleting) and avoid the common gotchas.

The skill is only knowledge: the agent still runs the real `wrapido` command.

## Get started

1. [Install the CLI](installation.md), so `wrapido` is on your `PATH`.
2. Install the plugin in your tool, following its guide in the table below.
3. Give the agent [credentials and a site](#credentials-and-a-site).
4. If the table says agent mode isn't detected in your tool, export `WRAPIDO_AGENT=1` in the shell you start it from.

Then ask for WordPress work in plain language, for example "List the five most recent draft posts."

## Supported tools

| Tool | Agent mode | Guide |
| --- | --- | --- |
| Claude Code | Detected (`CLAUDECODE`) | [Claude Code](claude-code.md) |
| GitHub Copilot CLI | Detected (`COPILOT_AGENT`, `COPILOT_ALLOW_ALL`) | [GitHub Copilot](github-copilot.md) |
| VS Code (Copilot chat) | Not detected, so set `WRAPIDO_AGENT=1` | [GitHub Copilot](github-copilot.md) |
| OpenAI Codex | Detected (`CODEX_*`) | [Codex](codex.md) |
| Gemini CLI | Not detected, so set `WRAPIDO_AGENT=1` | [Gemini CLI](gemini-cli.md) |
| Cursor | Detected (`CURSOR_AGENT`) | [Cursor](cursor.md) |

Where agent mode isn't detected, the skill also tells the agent to prefix its commands with `WRAPIDO_AGENT=1` when `wrapido --debug --help` reports `agent mode: off`. In any tool, `wrapido --debug --help` shows whether it's on.

### Other tools

Most other agents (OpenCode, Cline, Windsurf, Roo Code, Junie, Amp, Goose and more) read Agent Skills from a skills folder without a plugin. Copy `skills/wrapido` into that tool's skills folder (often `.agents/skills/`), or point the agent at [AGENTS.md](https://github.com/spacedmonkey/wrapido/blob/main/AGENTS.md), which is the same guidance as a plain file. Set `WRAPIDO_AGENT=1` unless the tool is listed under [Agent mode → Turn it on](agent-mode.md#turn-it-on).

## Credentials and a site

The setup is the same in every tool. Use a WordPress [Application Password](authentication-application-passwords.md), exported in the shell you start the tool from, so the password never appears in the conversation, your shell history or the process list:

```sh
export WP_USERNAME=admin
export WP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

Put the site in a `wrapido.yml` in your project so the agent never has to repeat `--url`:

```yaml
url: https://example.com
```

Other options:

- **Store a credential once** with `wrapido auth application-passwords add <url> --username="$WP_USERNAME" --password="$WP_PASSWORD"`. Stored credentials are used for that site automatically.
- **[OAuth2](authentication-oauth2.md)**, on a site running the WP-API/OAuth2 plugin: `wrapido auth oauth2 add <url> --client-id=<id> --client-secret=<secret>` (`client_credentials`), or `wrapido auth oauth2 add <url> --token=<token>` for a personal access token. A `client_credentials` token acts as user 0, so drafts and `--context=edit` still need a real user.
- **Skip it.** The agent asks which type you want and walks you through it the first time a request needs auth (drafts, private content, settings, any write, or a `401` error).

`auth ... login` prints a URL and waits for a callback on `127.0.0.1`, so a person has to open it in a browser on the same machine; the options above don't need one. Use `--use-auth=none` to see what an anonymous visitor sees.

!!! warning "Project files are trusted input"
    A `wrapido.yml` in a repository you cloned can set `url`, and exported `WP_USERNAME`/`WP_PASSWORD` would be sent to that site. Run `wrapido config get` in an unfamiliar project first. The skill tells the agent to do the same.

## How the plugins work

Every tool loads the same skill from `skills/wrapido/SKILL.md`, which follows the open [Agent Skills](https://agentskills.io/specification) format. Each tool reads a small manifest that names the plugin and points it at that folder:

| Tool | Manifest it reads |
| --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json`. This repository is a plugin and its own single-plugin marketplace. |
| GitHub Copilot (CLI and VS Code) | The Claude Code files, read directly. |
| OpenAI Codex | `.claude-plugin/marketplace.json`, plus a generated `.codex-plugin/plugin.json` that adds a display name, a category and example prompts for its plugin browser. |
| Gemini CLI | `gemini-extension.json` (generated). |
| Cursor | `.cursor-plugin/plugin.json` (generated). |

A skill is loaded only when a request is relevant (anything about a WordPress site), so it costs nothing in other conversations. Because every tool shares one skill, an update reaches all of them at once: update the plugin in your tool (each guide shows how) to pick it up.

## For maintainers

`.claude-plugin/plugin.json` is the single source of truth.

- Edit only that file and `skills/`. Then run `npm run sync:plugins` to regenerate `gemini-extension.json`, `.cursor-plugin/plugin.json` and `.codex-plugin/plugin.json` from it. The Codex/Cursor-only extras (logo, example prompts) live in `scripts/sync-agent-plugins.js`.
- Keep `version` in `.claude-plugin/plugin.json` equal to `package.json`'s, and bump it whenever the skill changes. Claude Code only offers an update when the version changes.
- CI runs `npm run check:plugins`, which fails if any of these is true:
    - a generated file is stale;
    - the two versions differ;
    - a skill breaks the Agent Skills `name`/`description` rules (VS Code silently drops a skill whose `name` is invalid).
- CI also runs `claude plugin validate .`.
- Never add a `plugin.json` at the repository root. Copilot (and Codex, given a `$schema`) would prefer it over `.claude-plugin/`.
