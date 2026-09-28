# TEAM ELITE PH TSHIRT

Sales tally for Team Elite PH t-shirt orders.

Open `login.html` in a browser, or serve the folder. There is no build step, framework, or runtime dependency. The npm dependencies are for development tests only.

## Getting in

The three pages, in order:

1. **Sign in** (`login.html`). The first account is **Joyce**, with the passcode agreed when the site was set up. Anyone can expand **First time on this device?** to add their own account.
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
  "createdAt": 0
}
```

The existing single list (`team-elite-ph-tshirt-people-v2`) becomes **Main list** on the first visit to Saved files. Its original storage key is left untouched as a fallback, even after edits or deletion of the migrated file. Older person shapes are normalized when that file is opened: the old white size, blue size, and extra 3XL/4XL columns become items. The old extra columns carried no color, so they are read as **white**. Anything saved from here on uses the shape above, and a **Backup** from an earlier version still restores.

## Tests

```sh
npm ci
npm test
```

Runs the unchanged `tally.test.js` suite, the jsdom model/three-page suites, and static audits. The tests cover migration, login, file CRUD, isolation, persistence, guard branches, read-only/edit behavior, cart flow, totals, the caret state, metadata, element IDs, and the fixed-point build stamp. `tally.js` and `tally.test.js` remain byte-identical to main at `d4811a5` (also identical to PR #5 at `2f2f175`). The spec's `39beb0` reference is not available in the fetched Git history; the rebuild was verified against current main instead.

Real-browser checks (requires Chromium):

```sh
npx playwright install --with-deps chromium
# In another terminal, serve this folder:
python3 -m http.server 8080 --bind 0.0.0.0
npm run test:e2e
```

The browser suite exercises sign-in → files → tally at 390px and 1440px, actual navigation guards, phone caret expansion, desktop header/body alignment, edit locking, refresh, reopening with a saved profile, file isolation, and sign-out. `PREVIEW_URL` can target another served URL; `CHROMIUM_PATH` can select an installed Chromium. Screenshots/results are ignored by Git. Optional remote fonts are stubbed in browser tests; application assets load normally.

## Publishing

For **Vercel**, choose preset **Other**, leave the build command empty, and set the output directory to **`.`**. No `vercel.json` is needed. Serve all three HTML pages and their sibling assets from the same origin.

### Bump the build stamp first

A stale `?v=` can serve old scripts against new HTML, leaving controls or storage wiring out of sync. Before publishing changed code or styles:

```sh
npm run stamp
npm test
npm run stamp:check
```

There is no compilation: `tools/build-stamp.cjs` only updates the cache token. It reads the current `BUILD`, replaces that **exact value** with a placeholder, hashes the sorted shipped-file list with SHA-1 and uses the first six hex characters. README, manifest, tests and development tooling are excluded. The new stamp goes in `app.js` and every local stylesheet/script URL on all three pages, including the new Store script.

For a fresh deploy-read verification, the equivalent hash command is:

```sh
node <<'JS'
const fs = require("node:fs"), crypto = require("node:crypto");
const old = fs.readFileSync("app.js", "utf8").match(/const BUILD = "([a-f0-9]{6})";/)[1];
const files = ["app.js", "favicon.svg", "index.html", "lists.html", "lists.js", "login.html", "login.js", "store.js", "styles.css", "tally.js"];
const hash = crypto.createHash("sha1");
files.forEach(file => hash.update(fs.readFileSync(file, "utf8").split(old).join("<stamp>")));
const fresh = hash.digest("hex").slice(0, 6);
console.log({ current: old, fresh });
if (old !== fresh) process.exitCode = 1;
JS
```

Do not blank every loose six-character hex match: that also matches stylesheet colour codes. `.split(old).join("<stamp>")` blanks only the current stamp and reaches a fixed point.

The honest consequence of a static site: saved files belong to the browser that made them, and the sign-in stays a lock screen. Publishing does not upload anyone's files. Each new device begins with its own empty file list; only a hosted service can make that shared.
