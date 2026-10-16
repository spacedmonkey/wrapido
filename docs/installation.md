---
tags:
  - cli
  - installation
---

# Installation

## Requirements

- Node.js `>= 20`

## Install from npm

```sh
npm install -g wrapido
wrapido --help
```

Or run it without installing:

```sh
npx wrapido --help
```

Update with `npm install -g wrapido@latest`, and remove it with `npm uninstall -g wrapido`.

## Install from GitHub Packages

Every release is also published to GitHub Packages as `@spacedmonkey/wrapido`. GitHub's npm registry needs a [personal access token](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token) with `read:packages`, even for public packages:

```sh
npm login --scope=@spacedmonkey --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @spacedmonkey/wrapido
```

## Install from source

Build and run:

```sh
git clone https://github.com/spacedmonkey/wrapido.git
cd wrapido
npm install
npm run build
```

This bundles the CLI to `dist/cli.js` (via [tsup](https://tsup.egoist.dev/)), which you can run directly:

```sh
./dist/cli.js <namespace> <route> [<verb>] [<id>] [--flag=value...] --url=<site>
```

### Install globally from source

To use a source build as the `wrapido` command from anywhere, instead of running it from inside the cloned repo:

```sh
git clone https://github.com/spacedmonkey/wrapido.git
cd wrapido
npm install
npm run build
npm install -g .
```

`npm install -g .` uses the `bin` entry in `package.json` to link a `wrapido` command onto your `PATH`, pointing at the `dist/cli.js` you just built. Confirm it worked with:

```sh
wrapido --help
```

To pick up later updates, `git pull` and re-run `npm run build && npm install -g .`.

If you're actively developing `wrapido` itself, `npm link` is more convenient than reinstalling on every change — it symlinks the global `wrapido` command to this working copy, so a rebuild (`npm run build`, or leave `npm run dev` running) is picked up immediately:

```sh
npm link
```

Remove either kind of global install with:

```sh
npm uninstall -g wrapido
```

## Development mode (no build step)

For local development, run commands directly against the TypeScript source via [tsx](https://github.com/privatenumber/tsx):

```sh
npm run -s wrapido -- <namespace> <route> [<verb>] [<id>] [--flag=value...] --url=<site>
```

Two things to get right with `npm run`:

-   **`-s` (`--silent`):** without it, npm prints its own `> wrapido@0.1.0 wrapido` banner on stdout before wrapido's output. That breaks anything that reads the output, such as `--format=json` piped to `jq`, or ids captured with `$(…)`:

    ```sh
    npm run -s wrapido -- wp/v2 posts delete $(npm run -s wrapido -- wp/v2 posts list --status=draft --per_page=-1 --format=ids) --url=<site>
    ```

    npm has no way to make a single script silent: `loglevel=silent` in `.npmrc` would also hide npm's own errors for every command, including `npm install`. So pass `-s` yourself.

-   **`--` before wrapido's arguments:** npm takes any flag in front of it as one of its own options. `npm run wrapido --url=<site> --quiet` never passes `--url` or `--quiet` to wrapido.

## Development scripts

| Command | Description |
| --- | --- |
| `npm run -s wrapido -- <args>` | Run against source via `tsx`, no build needed. `-s` keeps npm's banner out of the output. |
| `npm run build` | Bundle to `dist/cli.js` (tsup). |
| `npm run dev` | `tsup --watch`. |
| `npm test` | Run the full suite with Vitest: unit tests + an execa-driven integration suite against a local fixture server). |
| `npm run test:unit` | Vitest, unit suite only. |
| `npm run test:integration` | Vitest run, integration suite only. |
| `npm run test:watch` | Vitest in watch mode (unit suite only; see `test:integration:watch` for the integration suite). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | `eslint .`. |
| `npm run format` | `prettier --write .`. |

See [CONTRIBUTING.md](https://github.com/spacedmonkey/wrapido/blob/main/CONTRIBUTING.md) for the full contributor workflow.

## Use it with Claude Code

Once `wrapido` is on your `PATH`, you can install the `wrapido` skill so your AI coding agent knows how to use it. See [AI agents](ai-agents.md).
