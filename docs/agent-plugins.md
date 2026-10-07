---
tags:
  - agent-mode
  - claude-code
  - cli
---

# Agent plugins

`wrapido` ships one skill, `wrapido` (`skills/wrapido/SKILL.md`), packaged as a plugin for several AI coding tools. The skill teaches the agent to:

- start in the `wp/v2` namespace and discover the API before acting;
- always run in [agent mode](agent-mode.md);
- authenticate with Application Passwords or OAuth2, and walk you through setting one up when a request needs it;
- fetch every item with `--per_page=-1`;
- make bulk changes with several ids (batched through `/batch/v1`) and read partial failures;
- upload files;
- keep output small;
- follow the safety rules (drafts by default, confirm before deleting) and avoid the common gotchas.

The skill is only knowledge: the agent still runs the real `wrapido` command, so [install the CLI](installation.md) first. See [AI agents](ai-agents.md) for the full setup, including [credentials and a site](ai-agents.md#credentials-and-a-site).

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
