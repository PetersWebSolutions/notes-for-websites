# TEAM ELITE PH TSHIRT

Sales tally for Team Elite PH t-shirt orders.

Open `login.html` in a browser, or serve the folder. There is no build step, framework, or runtime dependency. The npm dependencies are for development tests only.

## Getting in

The three pages, in order:

1. **Sign in** (`login.html`). Three fixed team accounts exist on every device: **Joyce**, **Stuts** and **Gen**, all with the team passcode. Every page requires a sign-in first; sign-in leads to the lists page, and picking a list opens the tally. There is no self sign-up on the sign-in page; extra people can still be added from the Files page.
2. **Saved files** (`lists.html`). Give a file a name, press **NEW FILE**, then **OPEN**. You can rename or delete files, add another person to this device, or sign out here. Up to 200 files are kept, sorted by last modification, with people/shirt counts and timestamps.
3. **Tally** (`index.html?doc=…`). The bar at the top names the open file and links back to **All files**. Every save, edit, restore, and clear applies only to this file. JSON backups include its name.

Opening the tally without signing in goes to Sign in. Opening it signed in with no file chosen (or a missing file) lands on the files page, so a tally is never written to the wrong place. Refreshing keeps your session and saved data. The cart is still temporary until **ADD TO LIST**.

Accounts, sessions and files are tied to this browser and device. People on the same browser can see the same files; an owner name is a label, not a private access boundary. A public URL does **not** share saved files with another device. Private browsing, clearing site data, changing browser or opening a different site origin starts with separate storage. Keep JSON backups somewhere else.

## What the sign-in is, and is not

**A lock screen, not security.** The check runs in the browser, and anyone with developer tools can read past it, change the session or access the stored files. The short non-cryptographic hash hides the passcode from casual reading; it does not stop it being guessed. Do not reuse a sensitive password here. Adding an account is open to anyone on the device.

A real shared sign-in needs a hosted service behind it, with server-side authentication and a shared database. That is separate work, not something a static public URL provides.

## Prices

Prices are in Philippine pesos.

| Size | Price |
| --- | --- |
| S, M, L, XL | ₱399 |
| 2XL, 3XL, 4XL | ₱449 |

White and blue are the same price. The price comes from the size alone.

## The page has three sections

**1 · Name & orders** — enter the name and the shirts.

- **NAME** for the person
- **COLOR**, white or blue
- **SIZE**, S through 4XL. The price for that size shows under the menu
- **QTY**
- **ADD** at the bottom of the section. Press it once per shirt

One person can order several sizes of the same colour, so `white 2-S`, `blue 4-XL`, `white 5-4XL`, `white 2-2XL` is four separate ADD presses and lands in four separate cells.

**2 · Cart** — the shirts land here.

Every ADD press drops a line into the cart. Picking the same colour and size again tops up that line rather than duplicating it. A line quantity can be changed on the spot, and setting it to 0 or pressing its × drops the line. When the order is final, press **ADD TO LIST**: the name and the whole cart become one row in section 3, and the cart empties for the next person.

The cart is only memory. Nothing is kept until **ADD TO LIST**, and an order with no name or no shirts is refused.

**3 · List** — the tally.

One row per person, with:

- seven **WHITE** size columns, S through 4XL
- seven **BLUE** size columns, S through 4XL
- **PRICE** for the row
- **PAID/UNPAID**
- **EDIT**

The footer under the sheet adds up every size column, so the white M total and the blue 4XL total are both visible without scrolling. At the bottom of the section the **Tally** counts the people, the number of shirts, the paid and unpaid money with how many people sit behind each, and a count of every colour and size.

**The sheet is read only.** Quantities cannot be changed from the grid. Press **EDIT** on a row and its fourteen cells turn into quantity boxes, along with the name, then press **DONE** to lock the row again. While editing:

- a quantity of 0 clears that cell
- a quantity in a cell that was empty adds that shirt, so corrections do not need a new order
- only one row is editable at a time
- Escape finishes editing

**PAID** and **UNPAID** can be tapped at any time, with or without EDIT. The × at the end of a row removes the person, and offers Undo right after.

Search, the filter chips, and the sort menu all work on the list. The counts always cover the whole list, even when a filter hides some rows.

## List limits

- Up to 300 people
- Up to 99 shirts per size cell
- On phones, each person starts collapsed. Tap the caret beside the name to expand the size grid; EDIT also opens it. The fourteen cells remain in white/blue groups of seven. Summary chips appear only inside expanded rows, not as a replacement swipe row. Desktop keeps the original 18 visible columns.

Tap **Save list** to store the list on this website (in this browser). It is not uploaded. Use **Backup** if you need a copy, and **Export CSV** or **Copy summary** to share the count.

## Saved data

The list is stored as one person per row, where each person holds a list of items and each item is a color, a size, and a quantity:

```json
{
  "id": "…",
  "name": "Ana Reyes",
  "items": [
    { "color": "white", "size": "M", "qty": 2 },
    { "color": "blue", "size": "4XL", "qty": 1 }
  ],
  "paid": false,
  "claimed": { "white|M": 1 },
  "createdAt": 0
}
```

`claimed` counts how many shirts of each `color|size` cell the buyer has
already taken (a buyer may collect one shirt now and wait for a size that is
out of stock). Shirts not yet handed over show in red (✗), claimed ones in
green (✓). Press **EDIT** on the row and tap **CLAIMED / NOT CLAIMED** under a
size (or the chip on a phone) once per shirt handed over; tapping past the
last one resets the cell. The **Claimed** and
**Unclaimed** filters narrow the list (someone with one shirt claimed and one
waiting appears in both), **Copy unclaimed** copies the waiting
list, and the CSV export carries a **Claimed** column. Counts are clamped to
the ordered quantity whenever a row is edited or loaded.

The existing single list (`team-elite-ph-tshirt-people-v2`) becomes **Main list** on the first visit to Saved files. Its original storage key is left untouched as a fallback, even after edits or deletion of the migrated file. Older person shapes are normalized when that file is opened: the old white size, blue size, and extra 3XL/4XL columns become items. The old extra columns carried no color, so they are read as **white**. Anything saved from here on uses the shape above, and a **Backup** from an earlier version still restores.

## Shared lists (Supabase)

By default the tally is device-local, as described above. To make lists visible
across devices, connect a Supabase project. In the site UI, each list records a
maker: that account can edit, rename, or delete its list; other signed-in
accounts can view it or save a copy.

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and run
   [`supabase/migrations/0001_shared_lists.sql`](supabase/migrations/0001_shared_lists.sql).
   It creates `public.shared_lists`, seeds the `main` row, turns on row-level
   security, and adds the anon policies.
3. Copy the **Project URL** and **anon public** key from
   **Project Settings → API** into `supabase-config.js`.
4. Run
   [`supabase/migrations/0002_list_names_and_editor.sql`](supabase/migrations/0002_list_names_and_editor.sql),
   then
   [`supabase/migrations/0003_list_owner.sql`](supabase/migrations/0003_list_owner.sql).
   These add list names, last-editor metadata, and the maker column. If owner
   tracking is missing, the site can show older rows read-only with a migration
   message, but it will not silently make ownerless lists editable.

The connection is checked for you: `.github/workflows/supabase-connection.yml`
reads the URL and key from `supabase-config.js` once a day and requests the
shared row. A paused project, rotated key, or dropped policy shows up as a red
run instead of a silently device-local site. It can also be started by hand
from the Actions tab.

With a URL configured, sign-in leads to `lists.html`, which shows every online
list, its maker, and who last modified it. **OPEN** loads a list in the tally;
other makers' lists are **VIEW** only. **NEW LIST** and **SAVE LIST AS** create
lists owned by the signed-in name. The **Open list** menu switches between
lists. Pages poll every five seconds and refresh when another visitor changes
a list, never mid-edit.

### Existing lists

Migration 0003 cannot infer who originally made older lists, so those rows can
keep `created_by = NULL`. A blank maker used to lock everyone out, including
the person who made the list. On load the site fills a blank maker from the
last editor and writes that name into `created_by`, so only that person can
edit afterwards. Two lists Joyce confirmed she made — **Team Elite T-shirt
Tally** and **Team Elite T-shirt Tally copy** — are recorded as hers even if
the last editor is someone else. Anyone else can view those lists or save a
copy; they cannot edit, rename, or delete them.

Check the rows, then assign any remaining owner in Supabase SQL Editor, for
example:

```sql
select id, name, created_by, updated_by from public.shared_lists;
-- Only if Joyce is the verified maker of the main list:
update public.shared_lists set created_by = 'Joyce' where id = 'main' and created_by is null;
```

### Important security limitation

The owner-only rule currently hides and blocks edit controls in the site UI; it
is **not server-enforced authorization**. This site's sign-in is a browser-side
lock screen, and the current Supabase anon policies permit direct writes. A
visitor with the public anon key can bypass the UI and call the database API.
For a real security boundary, the app must use Supabase Auth (or another
server-verified identity) and Row Level Security policies tied to
`auth.uid()`—the current localStorage login cannot provide that identity.

- One shared row means last write wins if two people save in the same second.
- With `url` left empty in `supabase-config.js` the site behaves as before:
  private, per-browser files.
- `tools/preview-server.js` serves a stand-in shared backend so shared mode can
  be tried locally before connecting Supabase: `node tools/preview-server.js`
  then open <http://127.0.0.1:8080>. The real-browser suite expects
  device-local mode, so use `python3 -m http.server 8080` for `npm run test:e2e`.
- `supabase-config.js` is part of the build stamp, and Vercel serves it with
  `Cache-Control: public, max-age=0, must-revalidate`. Changing the project URL
  or anon key therefore reaches every visitor on their next load, instead of
  being held back by a cached copy of the old connection.

## Tests

```sh
npm ci
npm test
```

Runs the unchanged `tally.test.js` suite, the jsdom model/three-page suites, the static audits, and `deploy.test.js`. The tests cover migration, login, file CRUD, isolation, persistence, guard branches, read-only/edit behavior, cart flow, totals, the caret state, metadata, element IDs, the fixed-point build stamp, and the deploy config: the static preset in `vercel.json`, which assets may be cached forever, that `supabase-config.js` is revalidated, and that development files are ignored rather than published. `tally.js` and `tally.test.js` remain byte-identical to main at `d4811a5` (also identical to PR #5 at `2f2f175`). The spec's `39beb0` reference is not available in the fetched Git history; the rebuild was verified against current main instead.

The same commands run on GitHub for every push and pull request
(`.github/workflows/ci.yml`): one job for the Node suites plus
`npm run stamp:check`, and one job that installs Chromium, serves the folder on
port 8080 and runs the real-browser suite below.

Real-browser checks (requires Chromium):

```sh
npx playwright install --with-deps chromium
# In another terminal, serve this folder:
python3 -m http.server 8080 --bind 0.0.0.0
npm run test:e2e
```

The browser suite exercises sign-in → files → tally at 390px and 1440px, actual navigation guards, phone caret expansion, desktop header/body alignment, edit locking, refresh, reopening with a saved profile, file isolation, and sign-out. `PREVIEW_URL` can target another served URL; `CHROMIUM_PATH` can select an installed Chromium. Screenshots/results are ignored by Git. Optional remote fonts are stubbed in browser tests; application assets load normally.

The suite also stubs `supabase-config.js` with an empty connection, so it drives the device-local flow whatever the repo happens to ship. Without that stub the suite fails on its first assertion as soon as a real project URL is committed: `index.html` then opens straight to the shared list and never redirects to `login.html`.

## Publishing

Vercel is connected through the Git integration: a push to `main` deploys
production, and every pull request gets its own preview URL. The project
settings live in `vercel.json` so they travel with the code instead of existing
only in the dashboard:

- `framework: null`, `buildCommand: ""`, `outputDirectory: "."` — the folder
  itself is the site, with no toolchain in front of it.
- `installCommand: ""` — the npm dependencies are test-only (Playwright and
  jsdom), so a deploy does not install them and cannot fail on them.
- Cache headers — every stamped asset is served `max-age=31536000, immutable`,
  which is only safe because the `?v=` stamp changes whenever a shipped file
  changes. `supabase-config.js`, the three pages, and anything else the stamp
  does not cover are `max-age=0, must-revalidate` instead.
- `X-Content-Type-Options: nosniff`, a `Referrer-Policy` and a
  `Permissions-Policy` on every response.

`deploy.test.js` checks all of that against the repo on every `npm test`, so a
config that would serve stale assets, or publish the test folder, cannot be
merged quietly.

`.vercelignore` keeps development files out of the deployment, and that is not
cosmetic: `tests/dom.cjs` encodes the default passcode and
`tools/preview-server.js` is a stand-in shared backend. Neither belongs on a
public URL.

If the Vercel project is ever recreated: preset **Other**, empty build command,
output directory **`.`** — the same answers `vercel.json` already gives.

### Bump the build stamp first

A stale `?v=` can serve old scripts against new HTML, leaving controls or storage wiring out of sync. Before publishing changed code or styles:

```sh
npm run stamp
npm test
npm run stamp:check
```

There is no compilation: `tools/build-stamp.cjs` only updates the cache token. It reads the current `BUILD`, replaces that **exact value** with a placeholder, hashes the sorted shipped-file list with SHA-1 and uses the first six hex characters. README, manifest, tests and development tooling are excluded. The new stamp goes in `app.js` and every local stylesheet/script URL on all three pages, including the Store script and the Supabase connection file.

For a fresh deploy-read verification of the same hash, read-only:

```sh
node -e 'const{current,calculate}=require("./tools/build-stamp.cjs");const old=current();const fresh=calculate(old);console.log({current:old,fresh});if(old!==fresh)process.exitCode=1;'
```

It takes its file list from `tools/build-stamp.cjs` itself, so it cannot drift from what actually ships. An earlier copy of this command carried its own list of ten files and silently went stale the day `shared-store.js` was added: it reported a mismatch on a perfectly stamped tree.

Do not blank every loose six-character hex match: that also matches stylesheet colour codes. `.split(old).join("<stamp>")` blanks only the current stamp and reaches a fixed point.

The honest consequence of a static site: saved files belong to the browser that made them, and the sign-in stays a lock screen. Publishing does not upload anyone's files. Each new device begins with its own empty file list; only a hosted service can make that shared.
