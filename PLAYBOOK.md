# The Arena → GitHub → Vercel playbook

A step-by-step system for building websites and small systems with Arena, GitHub, and
Vercel. Written for this repo, but the loop is the same for every project.

The short version of everything below:

> **One repo per site. One session per feature. One PR per feature. Merge to `main` →
> Vercel deploys production. Write down the decisions in the repo so the next session
> starts with full context.**

Confusion almost always comes from breaking one of those five sentences.

---

## 1. The mental model (read this once, remember it forever)

There are only four places your work lives, and each has exactly one job:

| Place | Job | You should think of it as |
| --- | --- | --- |
| **Arena session** | A workbench with a clone of your repo, tools, and a live preview | "A teammate I hand a task to" |
| **GitHub branch** | A sealed envelope of one piece of work | "A proposal, not the truth" |
| **GitHub `main`** | The only truth. Whatever is here is what ships | "The product" |
| **Vercel** | Watches GitHub and publishes it to the internet | "A printer. It prints `main`." |

Three consequences that fix most beginner mistakes:

1. **Vercel never edits your code and you never upload files to Vercel.** You only push
   to GitHub; Vercel reacts. If the live site is wrong, the fix happens in a branch →
   PR → merge, not in the Vercel dashboard.
2. **An Arena session is disposable, the repo is not.** A session can be closed,
   confused, or broken. `main` survives. That is why you commit early and merge often
   instead of running one giant 40-message session.
3. **The agent does not remember your last session.** The repo is the memory. Anything
   you want the next session to know must be written into a file (README, PLAYBOOK,
   code comments). This is the single highest-leverage habit in this whole document.

### The naming trap you are currently in

This repo is called `notes-for-websites` but it contains the **TEAM ELITE PH TSHIRT**
sales tally. Nothing is broken, but every new session inherits a mismatch between the
repo name and the work inside it, which makes it easy to dump unrelated projects into
one repo. Recommended going forward:

- `team-elite-ph-tshirt` — the tally (this code)
- `peterswebsolutions-site` — your business/marketing site
- `<client>-<thing>` — one repo per client project

One repo per site also means one Vercel project per site, one custom domain per site,
and no risk of a client project breaking because you edited your own site.

---

## 2. Phase 0 — Before you open Arena (5 minutes, saves hours)

Answer these on paper or in a note. Vague answers in, vague website out.

1. **What is it?** One sentence. *"A tally sheet for t-shirt orders, used by one
   person on a phone."*
2. **Who uses it, on what device?** Phone-first vs desktop-first changes everything.
3. **Does data need to survive and be shared?** This is the big fork in the road:
   - **No / only on this device** → static HTML + `localStorage`. Cheapest, fastest,
     what this repo does today.
   - **Yes, multiple people or multiple devices** → you need a backend and a database
     (see §7). Decide this on day one; retrofitting it later is a rewrite.
4. **What does "done" look like?** List 3–6 concrete acceptance points you can click
   and verify. *"ADD puts a line in the cart. ADD TO LIST refuses an order with no
   name."* These become your test checklist.
5. **What is explicitly out of scope for v1?** Write it down. This is what stops a
   session from ballooning.

---

## 3. Phase 1 — Starting the project

### First time (new repo)

1. Create an empty repo on GitHub named after the **site**, not the topic of the day.
2. Start an Arena session on it.
3. Give it the Phase 0 answers as the first message (template in §8).
4. Let it scaffold **only the skeleton**: the page(s), the data model, one working
   flow end to end. Do not ask for every feature in message one.
5. Ask it to write the decisions into `README.md` before the session ends.
6. Merge the PR. That is your v1.

### Every time after (existing repo)

1. Start a **new session** for the feature (don't resurrect a three-week-old one).
2. First message = context + one goal + definition of done (§8).
3. Let it read the repo before it writes. A good prompt says: *"Read README.md and
   app.js first, then tell me your plan before you change anything."* Reviewing a plan
   is 10× cheaper than reviewing 800 lines of surprise.

---

## 4. Phase 2 — The build loop inside a session

This is the loop you repeat until the feature is done. Each pass is small.

1. **Ask for one change.** One behaviour, one screen, one bug. Not four.
2. **Watch it run.** Arena gives you a live preview. Use it. If the agent didn't run
   the thing, ask: *"Start the dev server so I can see it."*
3. **Test like a user, on a phone.** Click the actual flow. Most "the AI broke it"
   moments are really "nobody clicked it".
4. **Report what you saw, not what you assume.** Bad: *"it's broken, fix it."* Good:
   *"On the order form, I typed a name, pressed ADD with qty empty, and nothing
   happened — no error message. Expected: a red 'enter a quantity' hint."*
5. **Run the tests.** In this repo: `node tally.test.js` → should print
   `tally tests passed`. If there are no tests yet, ask for them: *"Extract the pricing
   and grid math into a module and write tests I can run with one command."* Tests are
   the only thing that stops session #7 from breaking what session #3 built.
6. **Commit the working state.** Small commits mean a bad change can be thrown away
   without losing the good ones.
7. Repeat.

### Running this site locally / in preview

There is no build step. To serve the folder:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# or
npx serve -l 8080
```

Always through a local server, never `file://` — `file://` blocks fetch, service
workers, and some storage behaviour, so you get bugs that don't exist in production.

### Rules that keep sessions from going sideways

- **One feature per session.** If you notice a second idea mid-session, write it into
  a `TODO.md` in the repo and start a new session for it later. Do not stack.
- **No rewrites of working code.** Say: *"Change only what this task needs. Don't
  restructure files that already work."*
- **Ask for the diff summary.** *"List every file you changed and why, in one line
  each."* If a file appears in that list you didn't expect, stop and ask.
- **Cache-busting is already a convention here.** `styles.css?v=c31d7e` and the
  `BUILD` constant in `app.js` must be bumped together whenever the CSS/JS changes,
  otherwise you'll be looking at an old build and debugging ghosts.
- **Stop while it's working.** Merging a small working PR beats polishing a big
  half-working one.

---

## 5. Phase 3 — GitHub: branches, PRs, merging

### What Arena does for you

When you start a session, Arena works on a branch (here:
`arena/01a0e3f8-notes-for-websites`), commits to it, pushes it, and opens a Pull
Request into `main`. You never need to type git commands. Your job is the **review**.

### The PR review habit (do this every single time)

On the PR page, in order:

1. **Read the title and description.** Does it match what you asked for? If the
   description is vague, ask the agent to rewrite it.
2. **Open "Files changed".** You don't need to read every line. Look for:
   - files you did **not** expect to be touched
   - deletions of things you wanted kept
   - secrets (anything that looks like a key, password, or database URL)
   - huge unexplained additions
3. **Open the Preview Deployment** Vercel posted on the PR (see §6) and click through
   the actual feature on your phone.
4. **Merge.** Squash-merge is fine and keeps `main` readable.
5. **Delete the branch** afterwards. Old branches are where confusion breeds. (You
   currently have 5 merged arena branches; cleaning them up costs one click each.)

### Protect `main`

Repo → Settings → Branches → add a rule for `main`. Minimum useful setup for a solo
builder: require a pull request before merging, and don't allow force pushes. This
makes it structurally impossible to accidentally overwrite your live site.

### Git commands worth knowing (only these five)

```bash
git status                      # what changed?
git log --oneline -10           # what happened recently?
git diff                        # show me the changes
git checkout main && git pull   # get back to the truth
git switch -                    # go back to the branch I was on
```

You can do 100% of your work through Arena + the GitHub website. Learn these five so
you can *look*, not so you can *drive*.

### Recovering from the common accidents

| Accident | Fix |
| --- | --- |
| Session went in circles / made it worse | Don't merge. Close the PR, start a new session. `main` is untouched. |
| Merged something broken | Vercel → Deployments → find the last good one → **Promote to Production** (instant rollback). Then fix forward in a new PR. |
| Two sessions edited the same repo | Merge one, then in the second session say: *"main has moved; rebase my branch on it and resolve conflicts."* |
| A PR that merges `main` into `main` (happened in PR #3 here) | Close it. It's a no-op that just pollutes history. |
| Lost work / deleted a file | `git log` finds it, `git checkout <commit> -- path/to/file` brings it back. Nothing in git is really lost. |

---

## 6. Phase 4 — Vercel: publishing

### One-time setup per site

1. vercel.com → **Add New… → Project** → **Import** the GitHub repo.
2. Vercel detects the framework. For this repo (plain HTML/CSS/JS, no `package.json`)
   it's **Other**: no build command, no output directory. Leave both empty.
3. For a framework project, leave the auto-detected build command alone
   (`npm run build`, output `dist` / `.next`) unless it fails.
4. **Production branch = `main`.** Check it in Settings → Git and never change it.
5. Click **Deploy**. You get `your-project.vercel.app`.
6. Later: Settings → Domains → add your real domain, and set the `www` redirect.

### The three environments — understand these and Vercel stops being magic

| Environment | Triggered by | URL | Variables used |
| --- | --- | --- | --- |
| **Production** | push/merge to `main` | your real domain | Production scope |
| **Preview** | any other branch + every PR | `project-git-branch-*.vercel.app` | Preview scope |
| **Development** | your own machine (`vercel dev`) | localhost | Development scope |

So the full loop is: **Arena session → branch → PR → Vercel builds a Preview URL →
you test that URL → merge → Vercel builds Production.** The preview URL on the PR is
the most under-used feature in this entire stack: it lets you test on your real phone,
over the real internet, before anything is live.

### Environment variables (the #1 source of "it works locally but not live")

- Set them in **Vercel → Project → Settings → Environment Variables**, never in the
  repo. `vercel.json` and every committed file are readable by anyone with repo access.
- Each variable is **scoped** to Production / Preview / Development. A variable scoped
  only to Production reads as `undefined` in preview deployments — the most common
  cause of "works on main, broken on the PR".
- Changing a variable does **nothing until you redeploy**. Push a commit or hit
  Redeploy.
- Mark secrets as **Sensitive**.
- Anything the browser can see must be treated as public. In Next.js that's the
  `NEXT_PUBLIC_` prefix — never put a secret key behind it.
- **Point Preview at a test database, not production.** Real teams lose real data this
  way: a tester opens a preview URL and edits live records.
- Never use a dashboard **Redeploy** as your release path for `main`. Release = merge.

### When a deploy fails

1. Vercel → Deployments → click the failed one → **Build Logs**. Read the *last*
   error, not the first wall of text.
2. 90% of failures are one of: missing env var, wrong build command/output dir,
   a dependency not in `package.json` (works locally because it was installed
   globally), or a Node version mismatch (set it in Settings → General → Node.js
   version).
3. Paste the failing log lines into your Arena session and ask for the fix. That is
   exactly what the session is for.

---

## 7. Phase 5 — When it stops being a "website" and becomes a "system"

A site with data that multiple people share needs three things a static page can't
give you: a server, a database, and logins. Pick the stack **before** you prompt.

**Recommended ladder for your situation (solo, Vercel-hosted, client work):**

1. **Static + `localStorage`** — one user, one device. (This repo. Keep it here; it's
   the right tool and costs nothing.)
2. **Static + a hosted database via API** — e.g. Supabase (Postgres + auth + row-level
   security) called from the browser. Small step up, no backend code to maintain.
3. **Next.js on Vercel** — server-side rendering, API routes, auth, a real database
   (Vercel Postgres / Neon / Supabase). This is the level for client systems with
   logins, dashboards, and shared data.

Rules at level 2–3:

- **Define the data model in words first**, then let the agent build it. Example from
  this repo, already documented in README.md:
  `{ id, name, items: [{ color, size, qty }], paid, createdAt }`.
- **Migrations are forever.** If you change the shape of saved data, you must convert
  old data on load — this repo does exactly that for the v1 → v2 storage key. Ask for
  it explicitly: *"Old saved lists must still load; write the conversion and a test
  for it."*
- **Auth before features.** Add logins early; bolting them on later means rewriting
  every query.
- **Secrets server-side only.** The browser gets a publishable key; the server holds
  the secret one.

---

## 8. Prompt templates (copy-paste, fill the blanks)

### A. Kick off a new feature session

```
Read README.md and PLAYBOOK.md in this repo before doing anything. Then read the
files relevant to this task and tell me your plan. Don't write code yet.

GOAL: <one sentence — what a user can do afterwards that they can't do now>

CONTEXT:
- It must work on <phone / desktop / both>.
- Data is stored in <localStorage / Supabase / none>.
- Keep using the existing <naming / styling / module> conventions.

DONE WHEN:
1. <clickable, observable outcome>
2. <clickable, observable outcome>
3. `node tally.test.js` passes and you added tests for <the new logic>.
4. README.md is updated with anything a future session must know.

OUT OF SCOPE (do not touch): <list>

Change only what this task needs. Start the preview server when it runs so I can
click through it.
```

### B. Reporting a bug

```
Bug, on <device/browser>:
1. I went to <page>
2. I did <exact steps>
3. I saw <what happened, including any error text>
4. I expected <what should happen>

Reproduce it first, tell me the cause, then fix it. Add a test that fails before the
fix and passes after.
```

### C. Ending a session cleanly

```
Before we finish:
1. Run the tests and the preview; confirm both pass.
2. Bump the BUILD constant in app.js and the ?v= tokens in index.html if CSS/JS changed.
3. Update README.md with the new behaviour and any decision I should know about.
4. Commit, push, and open a PR with a title that says what a user can now do, and a
   description listing what changed, what to click to test it, and what is out of scope.
```

### D. Rescuing a confused session

```
Stop. Don't write code. Summarise in five bullets: what you changed so far, what
state the app is in, what you were about to do, and what you're unsure about. Then
wait for my answer.
```

---

## 9. The checklist

**Before starting a session**
- [ ] One goal, written in one sentence
- [ ] I know what "done" looks like (clickable outcomes)
- [ ] `main` is clean and deployed (check Vercel once)

**During**
- [ ] Plan reviewed before code was written
- [ ] Preview clicked through on a phone
- [ ] Tests run and passing
- [ ] Only expected files changed

**Before merging**
- [ ] PR description matches the goal
- [ ] Preview Deployment URL tested
- [ ] No secrets in the diff
- [ ] README/PLAYBOOK updated with new decisions

**After merging**
- [ ] Vercel production build is green
- [ ] Live URL checked on phone and desktop
- [ ] Branch deleted
- [ ] Next task written into `TODO.md`, then a **new** session

---

## 10. A 4-week practice plan

You're a month in and still unsure, which usually means the reps have been uneven —
lots of prompting, not enough of the same full loop. Do this instead:

- **Week 1 — one loop, end to end.** Take the existing tally. Pick one small change
  (e.g. "show the unpaid total in the header"). Run the whole loop: session → plan →
  build → test → PR → preview URL → merge → check production. Then do it again with a
  second small change. Two full loops beats ten half-built features.
- **Week 2 — a new repo from scratch.** A one-page site for PetersWebSolutions:
  services, portfolio, contact. New repo, new Vercel project, custom domain. You'll
  learn the setup steps by doing them once with no legacy.
- **Week 3 — break it and fix it.** On purpose: delete a file, merge something broken,
  roll back via Vercel, resolve a conflict between two sessions. Knowing the recovery
  path is what removes the fear that makes people hesitant to start.
- **Week 4 — one real system.** Rebuild the tally at "level 2": same UI, but data in
  Supabase so two phones see the same list. This is where you learn auth, a database,
  and env vars — the things that separate a website from a system.

Keep this file updated as you learn. The version of this document in six months should
contain your own scars, and it should be the first thing every new session reads.
