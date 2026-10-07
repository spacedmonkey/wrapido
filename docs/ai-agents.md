---
tags:
  - agent-mode
  - claude-code
  - cli
---

# AI agents

AI coding agents (Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI, Cursor and others) can use `wrapido` to explore a WordPress site's REST API and build content with it. Two pieces make that work, and they're independent:

<div class="grid cards" markdown>

-   **[Agent mode](agent-mode.md)**

    Changes how the CLI _talks_: compact JSON output, JSON errors, warnings for unknown flags, and no colour or spinners. It turns itself on inside most agents and changes nothing for people at a terminal.

-   **[Agent plugins](agent-plugins.md)**

    Change what the agent _knows_. The `wrapido` skill, packaged as a plugin for Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI and Cursor, teaches the agent the workflow, the safety rules and the common gotchas.

</div>

## Get started

1. [Install the CLI](installation.md), so `wrapido` is on your `PATH`. The skill is only knowledge: the agent still runs the real `wrapido` command.
2. Install the plugin in your tool, following its guide under [Agent plugins → Supported tools](agent-plugins.md#supported-tools).
3. Give the agent [credentials and a site](#credentials-and-a-site).
4. If agent mode isn't detected in your tool (the [supported tools](agent-plugins.md#supported-tools) table says which), export `WRAPIDO_AGENT=1` in the shell you start it from. `wrapido --debug --help` shows whether it's on.

Then ask for WordPress work in plain language, for example "List the five most recent draft posts."

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
- **Skip it.** With the plugin installed, the agent asks which type you want and walks you through it the first time a request needs auth (drafts, private content, settings, any write, or a `401` error).

`auth ... login` prints a URL and waits for a callback on `127.0.0.1`, so a person has to open it in a browser on the same machine; the options above don't need one. Use `--use-auth=none` to see what an anonymous visitor sees.

!!! warning "Project files are trusted input"
    A `wrapido.yml` in a repository you cloned can set `url`, and exported `WP_USERNAME`/`WP_PASSWORD` would be sent to that site. Run `wrapido config get` in an unfamiliar project first. The skill tells the agent to do the same.
