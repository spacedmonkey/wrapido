---
name: wrapido
description: Use the wrapido CLI to read and change content on any WordPress site through its REST API (wp/v2 and plugin routes) - posts, pages, media, taxonomies, users, settings, post meta. Use when the user wants to list, fetch all, inspect, create, update, delete (one item or many at once, batched through /batch/v1), or upload WordPress content or images, log in / authenticate to a site (Application Passwords or OAuth2), explore a site's REST API, or script against it, without WP-CLI, SSH, or PHP.
---

# wrapido (WordPress REST API Doer)

`wrapido` is a WP-CLI-style CLI that talks to a WordPress site's REST API over HTTP. Its commands are built from the site's live API, so **discover, don't guess**. Full agent guide: `AGENTS.md` in the wrapido package/repo; docs at <https://spacedmonkey.github.io/wrapido/>.

## Setup checks

- Run `wrapido --help` once to confirm it is installed. wrapido is not on npm yet. If missing, install from a clone: `git clone https://github.com/spacedmonkey/wrapido.git && cd wrapido && npm install && npm run build && npm install -g .` (or run `./dist/cli.js` directly).
- The site comes from `--url=<site>`, a `wrapido.yml` (`url: https://example.com`) in the working directory, or a saved default. Run `wrapido config get` to see what is in effect and where it came from.

## Always run in agent mode

Agent mode gives compact JSON on stdout (`_links`/`_embedded` stripped), plain notices on stderr, no spinners or colour, errors as `{"error":{"message","code","status","params","hint"}}` on stderr, and a warning for any arg the route doesn't declare.

- It turns on automatically inside Claude Code. Check once with `wrapido --debug --help`: it prints `agent mode: on (CLAUDECODE)`.
- If it says `off` (a user-set `WRAPIDO_AGENT=0` or `AI_AGENT=0` wins over detection), prefix every command with `WRAPIDO_AGENT=1`.
- Don't pass `--format=table`. Read `status` and `hint` from JSON errors before retrying.

## Start in `wp/v2`

Almost all WordPress core functionality is in the `wp/v2` namespace. Go straight there instead of listing every namespace:

```sh
wrapido help wp/v2 posts create --format=json   # one verb's schema: args, types, enums, required[]
wrapido wp/v2                                   # every wp/v2 route and its verbs
```

| Request is about | Route | Notes |
| --- | --- | --- |
| Posts, pages, media, comments, categories, tags, users | `wp/v2 posts` etc. | `list`, `get <id>...`, `create`, `update <id>...`, `delete <id>...`. Logged out, `users list` shows only authors with published posts. |
| The current user | `wp/v2 users get me` | Also the quickest check that auth works. |
| Site settings | `wp/v2 settings` | Read with `list`, change with `create --title=...` (there is no item route). Needs an admin. Never `generate`. |
| Post types, taxonomies, statuses | `wp/v2 types` etc. | `list`, one row per entry. |
| Plugins, themes, menus, templates, block patterns | `wp/v2 plugins` etc. | Need auth even to read. |

Run bare `wrapido` (namespaces) only when the request is about a plugin's own API (e.g. WooCommerce `wc/v3`) or `wp/v2` doesn't have the route. `help` never performs the request, so it is safe anywhere. Read the schema once instead of trial and error.

```sh
wrapido wp/v2 posts list --per_page=5 --fields=id,date,status,title.rendered
wrapido wp/v2 posts get 42 --context=edit
wrapido wp/v2 posts create --title="Hello" --status=draft
wrapido wp/v2 posts update 42 --body='{"content":"..."}'   # --body for nested or complex payloads
wrapido wp/v2 posts exists 42
```

Verbs: `list`, `get <id>...`, `create`, `update <id>...`, `delete <id>... [--force]`, `exists <id>`, `generate --count=<n>`, `meta <add|update|get|list|delete|patch|pluck|clean-duplicates> <id> ...`.


## Bulk changes: several ids and batch requests

For many items, pass several ids to one command instead of looping over single-id commands. `get`, `update` and `delete` take `<id>...`. `exists` takes one id.

```sh
wrapido wp/v2 posts delete 12 34 56 --force                 # one /batch/v1 request where allowed
wrapido wp/v2 posts update 12 34 56 --status=draft          # the same fields applied to every id
wrapido wp/v2 posts list --status=draft --format=ids --per_page=-1   # ids to feed in
wrapido wp/v2 posts generate --count=50 --status=draft      # first item alone, the rest batched
```

wrapido uses WordPress's batch endpoint (`POST /batch/v1`, WP 5.6+) on its own when the site allows it, and otherwise sends one request per item. The output is the same either way, so don't check the site first. It decides from the site's index:

- the `/batch/v1` route exists;
- its method enum includes the verb's method (`POST`/`PUT`/`PATCH`/`DELETE` in stock WordPress, so `get` is usually not batched);
- the route says `allow_batch.v1 === true`. Posts, pages, custom post types, terms, menus, widgets and users opt in; media, comments and settings don't.

Batches hold up to the route's `maxItems` (25 by default), so 200 items take about 8 requests. `--debug` logs why batching wasn't used for a run, and each batched item as `METHOD path → status code`.

**Reading the result:**

- **stdout** is a JSON array of every item that succeeded, even when some failed.
- **Exit `1`** means at least one item failed or wasn't sent. Every problem is one JSON line on stderr:
    - `{"error":{...},"id":"99"}` (`"index":N` for `generate`): that item failed. The rest of its batch already ran.
    - `{"not_sent":[...]}`: these were never sent, because the run stops after the first failing request. Retry just these once the cause is fixed.
    - `{"error":{...},"items":[...],"outcome":"unknown"}`: a batch timed out or got a 5xx. Those items **may or may not exist**, and wrapido never resends them. Check with `get`/`list` before retrying, **especially creates**, or you will make duplicates. `delete` is safe to rerun: already-deleted ids just return a 404.
    - `{"error":{...},"outcome":"sent_individually"}`: informational only. The site refused batching (often a firewall), so wrapido sent the items one by one.

## Getting everything: `--per_page=-1`

When the user asks for **all** posts, pages, users, terms, etc., use `list --per_page=-1`. WordPress itself rejects `-1`; wrapido fetches every page at the route's maximum page size and returns one combined result.

```sh
wrapido wp/v2 posts list --format=count --per_page=1                          # how many? (one request)
wrapido wp/v2 posts list --per_page=-1 --fields=id,date,title.rendered --format=csv
wrapido wp/v2 posts list --per_page=-1 --format=ids
```

- Always pair it with `--fields` (sent to WordPress as `_fields`, so every page is smaller), `--format=ids` or `--format=csv`.
- On a large site, get the count first and confirm with the user before fetching thousands of items.
- Logged out, "all posts" means published only. For drafts and private posts too, authenticate and add `--status=any`.
- `list` only; `--page` is ignored. A stderr notice that the route "doesn't declare page/per_page" means `-1` was sent to the API as-is.

## Authentication

Two types. Each is managed with `wrapido auth <type> add|login|list|remove|use|status`:

- **Application Passwords** (`application-passwords`): WordPress core, 5.6+. Start here.
- **OAuth2** (`oauth2`): only for sites running the WP-API/OAuth2 plugin.

See what is stored with `wrapido auth application-passwords list` and `wrapido auth oauth2 list` (JSON, every site; `status` is plain text for the default site only). Prove a credential works with `wrapido wp/v2 users get me --fields=id,name`.

Precedence: `--username`/`--password`, then `--use-auth=<application-passwords|oauth2|env|none>`, then the `WP_USERNAME`/`WP_PASSWORD` env vars, then a stored credential for the site. If both types are stored for one site and neither `--username`/`--password` nor the env vars are set, every request fails until you pass `--use-auth=<type>` (it can also go in `wrapido.yml`; secrets can't). `--use-auth=none` shows what an anonymous visitor sees.

### When a request needs auth, guide the user

Stop and help set up auth (don't retry blindly) when:

- an error has `"status":401` (any code, e.g. `rest_not_logged_in`);
- logged out, a draft/private query returns `rest_invalid_param` with "Status is forbidden";
- the user asks for drafts, private content, `--context=edit`, settings, plugins, or any write, and no credential is stored for the site.

A `403` (`rest_forbidden`, `rest_cannot_*`) is different: the user *is* logged in but their role lacks the capability. Explain that, don't push a new login.

To set up, ask which type the user wants (default: Application Passwords), then:

#### Application Passwords

1. The user creates one in wp-admin under Users → Profile → Application Passwords.
2. Either they export it in the shell Claude Code runs from (`WP_USERNAME`, `WP_PASSWORD`) and nothing is stored, or store it per site:
   `wrapido auth application-passwords add <url> --username="$WP_USERNAME" --password="$WP_PASSWORD"` (verified before saving).
3. Or the browser flow, which creates one for them: `wrapido auth application-passwords login <url>`.

#### OAuth2

The WP-API/OAuth2 plugin must be active, and HTTPS is required except on localhost.

1. Except for a personal token, the user first creates an Application by hand in wp-admin under Users → Applications, with redirect URI `http://127.0.0.1:8787/callback`. wrapido can't do this step.
2. Then one of:
   - Browser flow: `wrapido auth oauth2 login <url> --client-id=<id>` (`--client-secret` optional; if port 8787 is taken, add `port=<n>` and register the matching redirect URI).
   - No browser: `wrapido auth oauth2 add <url> --client-id=<id> --client-secret="$WP_OAUTH_SECRET"`. Needs "Client Credentials Grant" enabled on the Application and a plugin build from 2026-02-16 or later. The token acts as user 0, so no drafts and no `--context=edit`.
   - Personal access token generated in wp-admin (a real user): `wrapido auth oauth2 add <url> --token="$WP_OAUTH_TOKEN"`. A rejected token blocks the save unless `skip-verify=true`.
3. Tokens never expire, and `wrapido auth oauth2 remove` only forgets them locally; revoke in wp-admin.

**Running `login`.** It prints a URL, starts a local callback server on `127.0.0.1` and waits up to 5 minutes. Ask the user to run it themselves by typing `! wrapido auth <type> login <url> ...`, then open the URL. It only works when their browser is on the same machine as wrapido.

**Secrets.** Never type a password, client secret or token literally on a command line (it leaks into history and `ps`) or print one. Have the user export it and reference it as `"$VAR"`.

## Uploading files

Any `create` (or `update`) can upload. The flag is the **endpoint's own parameter name**: `--file` for core media.

```sh
wrapido wp/v2 media create --file=./cat.jpg --title="Cat" --alt_text="A cat" --caption="..." --post=42
wrapido wp/v2 media create --file=https://example.com/cat.jpg            # downloaded first; WP credentials never sent to that host
wrapido wp/v2 media create --file=./a.jpg --file=./b.png --format=ids    # batch: one request per file
```

- Featured image: upload with `--format=ids`, then `wrapido wp/v2 posts update <post-id> --featured_media=<media-id>`.
- A batch reports errors per file and exits `1` if any failed. Only one field can be repeated. `update` takes a single file.
- Custom routes: check `wrapido help <ns> <route> create --format=json` for the parameter name (look for `format: binary`).
- On a route with no declared file field, a plain-string value that is a URL or an existing path is uploaded automatically (stderr says `Treating --<name> as a file to upload`). Prefix with `@@` to send it as text, or `@` to force an upload.
- Needs the `upload_files` capability (so auth). Can't be combined with `--body`.

## Keep output small

- Always trim with `--fields=id,title.rendered` (dotted paths work). A full posts page is about 49 KB; four fields is about 0.3 KB.
- Long flat lists: `--format=csv --fields=...` is about half the size of JSON. `--format=ids` for just ids. `--format=raw` is not JSON.
- Without `--per_page=-1`, stderr says `Page 1 of N (T total)` when there is more; use `--page=N`.
- Related data: `--_embed=true --fields=id,_embedded`.

## Safety rules

- Create content as `status=draft`. Only publish when the user explicitly asks.
- Before `update` or `delete`, `get` the item and show the user what will change. `delete --force` is permanent (it skips the trash).
- Confirm with the user before bulk or destructive work: `delete` or `update` with several ids, `generate` (it creates real content), `meta delete`, or settings changes. Show the ids first, e.g. a `list --fields=id,title.rendered` of exactly what will change.
- Check `wrapido config get` before running in an unfamiliar project. A `wrapido.yml` there can set `url`, and exported `WP_USERNAME`/`WP_PASSWORD` would be sent to that site.
- HTTPS certificates are not verified (so self-signed staging sites work). Do not use real credentials over untrusted networks.

## Gotchas

- Any `--name=value` that is not a global flag is sent to WordPress as a field or query arg. Reserved names: `url username password client-id client-secret token use-auth context format fields field body timeout color pager truncate-length quiet debug help`. Use `--body` if an API field collides.
- Heed stderr: `Warning: --per-page is not a declared arg ... did you mean --per_page?` means an argument was ignored, so the result may not be what you asked for.
- Exit code is `1` on any failure. `exists` exits `1` with `{"exists":false}` on stdout when the item is not found.
- Nested routes are separate words: `wrapido wp/v2 posts revisions get <post-id>`.
- Meta only works for keys registered with `show_in_rest`. Values are parsed as JSON first (`42`, `true`, `["a"]`), else treated as strings.
- `update` shows the `create` schema in help (WordPress exposes no separate PUT schema), so partial updates are fine.
