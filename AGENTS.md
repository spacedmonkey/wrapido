# Using wrapido from an AI agent

`wrapido` talks to any WordPress site's REST API over HTTP. Its command set is built from the site's live API, so **discover, don't guess**. Human docs: `docs/agent-mode.md`.

## 1. Agent mode

Usually **automatic**: detected from your environment (Claude Code, OpenAI Codex, GitHub Copilot, Cline, Cursor, or the cross-tool `AI_AGENT` convention). If your tool isn't detected, set it by hand:

```sh
export WRAPIDO_AGENT=1
```

`WRAPIDO_AGENT` always wins over detection — `0`/`false`/`no`/`off` forces it off, `1` (or anything else non-falsy) forces it on. Run with `--debug` to see whether it's on and why (`agent mode: on (AI_AGENT)`). With it set you get:

-   `--format=json` by default, printed **compact** with `_links`/`_embedded` stripped (name them in `--fields` to keep them).
-   No colour, no spinners. Data is on **stdout**; notices/warnings are plain lines on **stderr**.
-   Errors as JSON on stderr: `{"error":{"message","code","status","params","hint"}}`. Local CLI errors carry only `message`; API errors add the rest and often a `hint`. Exit code is `1` on any failure.
-   A stderr `Warning: --per-page is not a declared arg of this route; did you mean --per_page?` for `--name=value` args the route doesn't declare (typos are otherwise silently ignored by WordPress). A route that declares no fields at all (missing `args`, or an explicitly empty `{}`) never warns, either way — there's no real contract to violate.

Without it, pass `--format=json --quiet --no-color` on every call instead. An explicit `--format` or a `format:` in a `wrapido.yml` still overrides the agent-mode default.

Also put the site in a `wrapido.yml` in the working directory (or pass `--url=<site>` each time):

```yaml
url: https://example.com
```

## 2. Authenticate headlessly

Two types: **Application Passwords** (WordPress core, start here) and **OAuth2** (only with the WP-API/OAuth2 plugin). Headless options:

-   Env vars `WP_USERNAME` + `WP_PASSWORD` (a WordPress Application Password). Preferred: `--password` leaks into shell history and `ps`.
-   Or store once: `wrapido auth application-passwords add <url> --username="$WP_USERNAME" --password="$WP_PASSWORD"`.
-   OAuth2 (needs HTTPS except on localhost): `wrapido auth oauth2 add <url> --client-id=<id> --client-secret="$SECRET"` (`client_credentials`; the Application must be created by hand in wp-admin with "Client Credentials Grant" enabled; acts as user 0, so no drafts or `--context=edit`), or `wrapido auth oauth2 add <url> --token="$TOKEN"` for a personal access token (a real user).

`auth ... login` prints a URL and waits for a callback on `127.0.0.1`, so a human must open it in a browser on the same machine: ask the user to run it.

Stored credentials are used **implicitly** for that site; `wrapido auth <type> list` shows them (JSON). Use `--use-auth=none` to see what an anonymous visitor sees, and `--use-auth=<type>` when a site has both types stored (otherwise the request fails, unless `--username`/`--password` or `WP_USERNAME`/`WP_PASSWORD` are set, which win). Check auth with `wrapido wp/v2 users get me`.

On an error with `status` 401 (or a logged-out `rest_invalid_param` "Status is forbidden" for drafts), stop and guide the user through setting up auth. A 403 means the user is logged in but lacks the capability; don't push a new login.

## 3. Best workflow: discover, then act

Almost all WordPress core functionality (posts, pages, media, users, comments, terms, settings, plugins, themes) is in `wp/v2`: start there, and list namespaces only for a plugin's own API.

```sh
wrapido                                # namespaces
wrapido wp/v2                     # routes: [{route, verbs:[...], has_children}]
wrapido wp/v2 posts               # the route: verbs, endpoints (args, types, enums, required[]), children[]
wrapido help wp/v2 posts create   # ONE verb's endpoint only (cheapest; ~9 KB vs ~15 KB for the whole route)
```

Then act with `list`, `get <id>`, `create`, `update <id>`, `delete <id>`, `exists <id>`, `generate`, `meta ...`:

```sh
wrapido wp/v2 posts list --per_page=5 --fields=id,date,title.rendered
wrapido wp/v2 posts create --title="Hello" --status=draft
wrapido wp/v2 posts update 12 --body='{"content":"..."}'   # --body for nested/complex payloads
```

Nested routes (e.g. `posts revisions`) appear in a route's `children` array, and as `has_children: true` in a namespace listing. Address them as separate words: `wrapido wp/v2 posts revisions get <post-id>` (revisions/autosaves need a real user).

Tips for fewer calls:

-   Prefer `help <ns> <route> <verb> --format=json` over the bare route call; each endpoint carries a `required` array of arg names.
-   "All posts": `list --per_page=-1 --fields=...` fetches every page in one command (check `--format=count` first on a big site). Logged out it returns published items only; add auth and `--status=any` for everything.
-   Cheap counts: `list --format=count --per_page=1` prints the site total.
-   To embed related data: `--_embed=true --fields=id,_embedded`.

-   Read the schema once (`help <ns> <route> <verb> --format=json` is scoped to that verb's HTTP method) instead of trial and error.
-   Trim output with `--fields=id,title.rendered` (dotted paths keep their nesting in JSON).
-   For a long flat list, `--format=csv --fields=id,date,slug` is about half the size of JSON (nested values become dotted columns like `title.rendered`; use JSON when you need nesting). Trimming with `--fields` matters far more than the format: a full posts page is ~49 KB, the same page with 4 fields ~0.3 KB.
-   Heed stderr warnings: a `Warning: ...` means an arg was ignored, so the result may not be what you asked for.
-   Check `hint` in JSON errors before retrying.

## 4. Facts worth knowing

-   Any `--name=value` that isn't a global flag is sent as a WordPress field/query arg. Reserved names: `url username password client-id client-secret token use-auth context format fields field body timeout color pager truncate-length quiet debug help`; use `--body` if an API field collides.
-   `list --format=count` prints the site total (`X-WP-Total`) when sent, else the rows returned. Default `--per_page` is 10 (the route's max, usually 100), newest first. When more pages exist, stderr says `Page 1 of N (T total)`; use `--page=N`, or `--per_page=-1` to get every page in one go (it ignores `--page`, and count never needs it).
-   `exists <id>` exits `1` for "not found" and still prints `{"exists":false}` on stdout. An unknown route or namespace exits `1` with `No such route`/`No such namespace` (a JSON error in agent mode).
-   `--format=raw` is Node-inspect text, not JSON.
-   `wp/v2 settings` has no item route: read with `list`, change with `create --<setting>=...`.
-   Nested routes are separate words: `wrapido wp/v2 posts revisions get <post-id>`.
-   `types`, `taxonomies`, `statuses` list one row per entry, so `--fields=slug,name` works.
-   Uploads: the flag is the endpoint's own parameter name: `wrapido wp/v2 media create --file=./img.png --alt_text=...` (a path or `http(s)://` URL; repeat `--file` for a batch). Featured image: upload, then `posts update <id> --featured_media=<media-id>`. Needs `upload_files`.
-   `--debug` logs every HTTP request (credentials redacted) to stderr.
-   HTTPS certificates are **not verified**; don't use real credentials on untrusted networks.

Full docs: `docs/agent-mode.md`, `docs/usage.md`, `docs/authentication.md`, `docs/uploading-files.md`.
