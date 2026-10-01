---
name: wrapido
description: Use the wrapido CLI to read and change content on any WordPress site through its REST API - posts, pages, media, taxonomies, users, post meta, and plugin routes. Use when the user wants to list, inspect, create, update, delete, or upload WordPress content, explore a site's REST API, or script against it, without WP-CLI, SSH, or PHP.
---

# wrapido (WordPress REST API Doer)

`wrapido` is a WP-CLI-style CLI that talks to a WordPress site's REST API over HTTP. Its commands are built from the site's live API, so **discover, don't guess**. Full agent guide: `AGENTS.md` in the wrapido package/repo; docs at <https://spacedmonkey.github.io/wrapido/>.

## Setup checks

- Run `wrapido --help` once to confirm it is installed. wrapido is not on npm yet. If missing, install from a clone: `git clone https://github.com/spacedmonkey/wrapido.git && cd wrapido && npm install && npm run build && npm install -g .` (or run `./dist/cli.js` directly).
- Agent mode (compact JSON, no spinners or colour, JSON errors on stderr) turns on automatically inside Claude Code. If output looks like a table, set `WRAPIDO_AGENT=1` or pass `--format=json --quiet --no-color`. `--debug` shows whether it is on.
- The site comes from `--url=<site>`, a `wrapido.yml` (`url: https://example.com`) in the working directory, or a saved default. Run `wrapido config get` to see what is in effect and where it came from.

## Authentication (headless only)

- Use a WordPress **Application Password** via env vars `WP_USERNAME` and `WP_PASSWORD`. Never put `--password` on the command line (it leaks into history and `ps`), and never print or log credentials.
- Or store once: `wrapido auth application-passwords add <url> --username=<u> --password=<app-password>`. Stored credentials are then used automatically for that site.
- `wrapido auth ... login` opens a browser: do not run it. Ask the user to run it, or to supply an Application Password.
- `--use-auth=none` shows what an anonymous visitor sees. If both an application-passwords and an oauth2 credential are stored, pass `--use-auth=<type>`.
- Drafts, private content, revisions, and `--context=edit` need a real authenticated user.

## Workflow: discover, then act

```sh
wrapido                                  # namespaces
wrapido wp/v2                            # routes and their verbs
wrapido help wp/v2 posts create --format=json   # one verb's schema: args, types, enums, required[]
```

`help` never performs the request, so it is safe to run anywhere. Read the schema once instead of trial and error. Then:

```sh
wrapido wp/v2 posts list --per_page=5 --fields=id,date,status,title.rendered
wrapido wp/v2 posts get 42 --context=edit
wrapido wp/v2 posts create --title="Hello" --status=draft
wrapido wp/v2 posts update 42 --body='{"content":"..."}'   # --body for nested or complex payloads
wrapido wp/v2 posts exists 42
```

Verbs: `list`, `get <id>`, `create`, `update <id>`, `delete <id> [--force]`, `exists <id>`, `generate --count=<n>`, `meta <add|update|get|list|delete|patch|pluck|clean-duplicates> <id> ...`.

## Keep output small

- Always trim with `--fields=id,title.rendered` (dotted paths work). A full posts page is about 49 KB; four fields is about 0.3 KB.
- Counts: `list --format=count --per_page=1` prints the site total.
- Every page: `list --per_page=-1` (uses the route's max page size). Otherwise stderr says `Page 1 of N (T total)`; use `--page=N`.
- Long flat lists: `--format=csv --fields=...` is about half the size of JSON. `--format=ids` for just ids. `--format=raw` is not JSON.
- Related data: `--_embed=true --fields=id,_embedded`.

## Safety rules

- Create content as `status=draft`. Only publish when the user explicitly asks.
- Before `update` or `delete`, `get` the item and show the user what will change. `delete --force` is permanent (it skips the trash).
- Confirm with the user before bulk or destructive work: loops over `delete`, `generate` (it creates real content), or `meta delete`.
- Check `wrapido config get` before running in an unfamiliar project. A `wrapido.yml` there can set `url`, and exported `WP_USERNAME`/`WP_PASSWORD` would be sent to that site.
- HTTPS certificates are not verified (so self-signed staging sites work). Do not use real credentials over untrusted networks.

## Gotchas

- Any `--name=value` that is not a global flag is sent to WordPress as a field or query arg. Reserved names: `url username password client-id client-secret token use-auth context format fields field body timeout color pager truncate-length quiet debug help`. Use `--body` if an API field collides.
- Heed stderr: `Warning: --per-page is not a declared arg ... did you mean --per_page?` means an argument was ignored, so the result may not be what you asked for. Check `hint` in JSON errors before retrying.
- Exit code is `1` on any failure. `exists` exits `1` with `{"exists":false}` on stdout when the item is not found.
- Nested routes are separate words: `wrapido wp/v2 posts revisions get <post-id>`. `types`, `taxonomies`, `statuses` list one row per entry.
- Uploads: the flag is the endpoint's own parameter name, `--file=./cat.jpg` for core media (a path or `http(s)://` URL). Repeat the flag for several files. Needs the `upload_files` capability. Uploads cannot be combined with `--body`.
- Meta only works for keys registered with `show_in_rest`. Values are parsed as JSON first (`42`, `true`, `["a"]`), else treated as strings.
- `update` shows the `create` schema in help (WordPress exposes no separate PUT schema), so partial updates are fine.
