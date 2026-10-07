---
tags:
  - agent-mode
  - claude-code
  - cli
---

# AI agent plugins

`wrapido` ships one skill, `wrapido` (`skills/wrapido/SKILL.md`), packaged as a plugin for several AI coding tools. The skill teaches the agent how to drive the CLI:

- start in the `wp/v2` namespace and discover the API before acting;
- always run in agent mode;
- authenticate with Application Passwords or OAuth2, and walk you through setting one up when a request needs it;
- fetch every item with `--per_page=-1`;
- make bulk changes with several ids (batched through `/batch/v1`) and read partial failures;
- upload files;
- keep output small;
- follow the safety rules (drafts by default, confirm before deleting) and avoid the common gotchas.

The skill is only knowledge: the agent still runs the real `wrapido` command, so [install the CLI](installation.md) first, whichever tool you use.

## Supported tools

| Tool | Manifest it reads | Agent mode | Guide |
| --- | --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json` | Detected (`CLAUDECODE`) | [Claude Code](claude-code.md) |
| GitHub Copilot CLI | `.claude-plugin/plugin.json` + `marketplace.json` (read directly) | Detected (`COPILOT_AGENT`, `COPILOT_ALLOW_ALL`) | [GitHub Copilot](github-copilot.md) |
| VS Code (Copilot chat) | `.claude-plugin/plugin.json` (read directly) | Not detected, so set `WRAPIDO_AGENT=1` | [GitHub Copilot](github-copilot.md) |
| OpenAI Codex | `.codex-plugin/plugin.json` (generated) + `.claude-plugin/marketplace.json` | Detected (`CODEX_*`) | [Codex](codex.md) |
| Gemini CLI | `gemini-extension.json` (generated) | Not detected, so set `WRAPIDO_AGENT=1` | [Gemini CLI](gemini-cli.md) |
| Cursor | `.cursor-plugin/plugin.json` (generated) | Detected (`CURSOR_AGENT`) | [Cursor](cursor.md) |

## How it works

Every tool loads the same skill from `skills/wrapido/SKILL.md`, which follows the open [Agent Skills](https://agentskills.io/specification) format. Each tool reads a small manifest that names the plugin and points it at that folder:

- **Claude Code** reads `.claude-plugin/`. This repository is a plugin and its own single-plugin marketplace.
- **GitHub Copilot and OpenAI Codex** read the Claude Code files directly, so there is nothing extra to keep in sync. Codex also gets a generated `.codex-plugin/plugin.json` that adds a display name, a category and example prompts for its plugin browser.
- **Gemini CLI and Cursor** don't read `.claude-plugin/`. Each gets its own generated manifest: `gemini-extension.json` for Gemini, `.cursor-plugin/plugin.json` for Cursor.

A skill is loaded only when a request is relevant (anything about a WordPress site), so it costs nothing in other conversations.

Because every tool shares one skill, an update reaches all of them at once: update the plugin in your tool (each guide shows how) to pick it up.

## Agent mode

Agent mode gives the agent compact JSON output and JSON errors. It switches itself on in the tools marked *Detected* above. In the others, export `WRAPIDO_AGENT=1` in the shell you start the tool from; the skill also tells the agent to prefix commands with it when `wrapido --debug --help` reports `agent mode: off`. See [Agent mode](agent-mode.md).

## Credentials and a site

The setup is the same in every tool:

- Export an [Application Password](authentication-application-passwords.md) as `WP_USERNAME`/`WP_PASSWORD` in the shell you start the tool from.
- Put `url: https://example.com` in a `wrapido.yml` in your project.

The details, including OAuth2, are in [Claude Code skill → Give Claude credentials and a site](claude-code.md#3-give-claude-credentials-and-a-site).

!!! warning "Project files are trusted input"
    A `wrapido.yml` in a repository you cloned can set `url`, and exported `WP_USERNAME`/`WP_PASSWORD` would be sent to that site. Run `wrapido config get` in an unfamiliar project first. The skill tells the agent to do the same.

## Other tools

Most other agents (OpenCode, Cline, Windsurf, Roo Code, Junie, Amp, Goose and more) read Agent Skills from a skills folder without a plugin. Copy `skills/wrapido` into that tool's skills folder (often `.agents/skills/`), or point the agent at [AGENTS.md](https://github.com/spacedmonkey/wrapido/blob/main/AGENTS.md), which is the same guidance as a plain file.

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
