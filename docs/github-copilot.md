---
tags:
  - agent-mode
  - cli
---

# GitHub Copilot

The [`wrapido` skill](agent-plugins.md) installs as a plugin in both the [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli) and [VS Code's Copilot chat](https://code.visualstudio.com/docs/copilot/customization/agent-plugins). It teaches Copilot to drive the `wrapido` CLI: discover the site's REST API first, run in agent mode, authenticate, page through everything, make bulk changes, upload files, and follow the safety rules.

## How it works

Copilot reads this repository's Claude Code plugin files directly: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. There is no Copilot-specific manifest to install or keep in sync. The plugin's only content is the skill in `skills/wrapido/SKILL.md`, which Copilot loads when a request is about a WordPress site.

## 1. Install the CLI

Copilot runs `wrapido` from your shell, so it must be on your `PATH`. See [Installation](installation.md), then check with `wrapido --help`.

## 2. Install the plugin

### Copilot CLI

Add the repository as a marketplace, then install the plugin from it:

```sh
copilot plugin marketplace add spacedmonkey/wrapido
copilot plugin install wrapido@wrapido
```

Inside an interactive session, the same commands are available as `/plugin marketplace add spacedmonkey/wrapido` and `/plugin install wrapido@wrapido`. You can also install it straight from the repository without adding a marketplace: `copilot plugin install spacedmonkey/wrapido`.

Check it with `copilot plugin list`. Inside a session, `/skills` lists the loaded skills.

### VS Code

Add the repository as a plugin marketplace in your VS Code settings:

```json
{
	"chat.plugins.marketplaces": [ "spacedmonkey/wrapido" ]
}
```

Then search `@agentPlugins` in the Extensions view and install `wrapido`. Alternatively, run **Chat: Install Plugin From Source** from the Command Palette and enter `https://github.com/spacedmonkey/wrapido`. Plugin support must be on (`chat.plugins.enabled`).

Check it with **Chat: Configure Skills**, which should list `wrapido`.

## 3. Turn on agent mode (VS Code only)

The Copilot CLI is detected automatically. VS Code's chat sets no environment variable that `wrapido` can detect, so in VS Code export `WRAPIDO_AGENT=1` in the environment VS Code's terminal inherits. Alternatively, add it to `terminal.integrated.env.*` in your settings. Check with `wrapido --debug --help`, which prints `agent mode: on (...)`. The skill also tells Copilot to prefix its commands with `WRAPIDO_AGENT=1` when it sees `off`. See [Agent mode](agent-mode.md).

## 4. Credentials and a site

Export `WP_USERNAME`/`WP_PASSWORD` (an [Application Password](authentication-application-passwords.md)) before starting Copilot, and put `url: https://example.com` in a `wrapido.yml` in your project. See [AI agent plugins → Credentials and a site](agent-plugins.md#credentials-and-a-site), including the warning about `wrapido.yml` in cloned repositories.

## 5. Use it

Ask for WordPress work in plain language. For example:

- "List the five most recent draft posts."
- "Create a draft post titled Hello World with this content: ..."
- "Upload `./cat.jpg` to the media library and set its alt text."
- "Get the titles of all published posts."

The Copilot CLI asks before running shell commands. To let it run `wrapido` without a prompt each time, start it with `--allow-tool 'shell(wrapido)'`. That allows writes as well as reads, so only do this for sites you are happy for it to change.

## Update or remove

| | Copilot CLI | VS Code |
| --- | --- | --- |
| Update | `copilot plugin update wrapido` | **Extensions: Check for Extension Updates** (also automatic with `extensions.autoUpdate`) |
| Disable | `copilot plugin disable wrapido` | Agent Plugins - Installed view → Disable |
| Remove | `copilot plugin uninstall wrapido`, then `copilot plugin marketplace remove wrapido` | Agent Plugins - Installed view → Uninstall |
