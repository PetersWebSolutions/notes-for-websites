"use strict";

/*
 * Shared list backend for Supabase. When supabase-config.js holds a project
 * URL and anon key, the tally reads and writes ONE shared list that every
 * visitor sees, instead of this browser's private storage. With no URL this
 * file stays quiet and the site keeps its device-local behavior.
 *
 * Each list lives in one row of the shared_lists table:
 *   id (text), people (jsonb), updated_at (timestamptz),
 *   name (text), updated_by (text)      -- added by migration 0002
 *
 * The page opens the row named in the URL (?list=<id>), else the one from
 * supabase-config.js. SAVE LIST AS adds a row that everyone can then open.
 * A project that has not run migration 0002 yet still works: reads and
 * writes fall back to the three original columns.
 *
 * Plain fetch against Supabase's REST (PostgREST) API — no SDK, no build.
 */
const SharedStore = (function () {
  const config = (typeof window !== "undefined" && window.SUPABASE_CONFIG) || {};
  const POLL_MS = 5000;

  function url() { return String(config.url || "").replace(/\/+$/, ""); }
  function enabled() { return /^https?:\/\//.test(url()) && Boolean(config.anonKey); }
  function listId() {
    const match = typeof window !== "undefined" && /[?&]list=([^&]+)/.exec(window.location.search || "");
    if (match) {
      try { return decodeURIComponent(match[1]).slice(0, 80); } catch (error) { /* fall through */ }
    }
    return String(config.listId || "main");
  }

  /* One meta row for the picker: { id, name, updatedAt, updatedBy }. */
  function meta(row) {
    return {
      id: String(row.id),
      name: row.name ? String(row.name) : (row.id === "main" ? "Shared list" : String(row.id)),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
      updatedBy: row.updated_by ? String(row.updated_by) : "",
      createdBy: row.created_by ? String(row.created_by) : ""
    };
  }

  /* Remembered once a 400 shows the project lacks the 0002 columns. */
  let legacySchema = false;
  const EXTRA_COLS = ",name,updated_by,created_by";

  function headers(extra) {
    return Object.assign({
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json"
    }, extra || {});
  }

  function endpoint() { return `${url()}/rest/v1/shared_lists`; }
  function byId() { return `${endpoint()}?id=eq.${encodeURIComponent(listId())}`; }

  async function getRows(query) {
    let res = await fetch(`${endpoint()}?${query}`, { method: "GET", headers: headers() });
    if (res.status === 400 && !legacySchema && /name|updated_by|created_by/.test(query)) {
      legacySchema = true;
      res = await fetch(`${endpoint()}?${query.replace(EXTRA_COLS, "")}`, { method: "GET", headers: headers() });
    }
    if (!res.ok) throw new Error(`Shared list load failed (${res.status}).`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function load() {
    const rows = await getRows(`id=eq.${encodeURIComponent(listId())}&select=people,updated_at,name,updated_by,created_by`);
    const row = rows.length ? rows[0] : null;
    const info = row ? meta(Object.assign({ id: listId() }, row)) : meta({ id: listId() });
    return {
      people: row && Array.isArray(row.people) ? row.people : [],
      updatedAt: info.updatedAt,
      name: info.name,
      updatedBy: info.updatedBy,
      createdBy: info.createdBy,
      exists: Boolean(row)
    };
  }

  /* Every shared list, newest change first. withPeople adds the rows' names. */
  async function listAll(options = {}) {
    try {
      const cols = options.withPeople ? `id,updated_at,people${EXTRA_COLS}` : `id,updated_at${EXTRA_COLS}`;
      const rows = await getRows(`select=${cols}&order=updated_at.desc&limit=200`);
      return rows.map((row) => Object.assign(meta(row), { people: Array.isArray(row.people) ? row.people : [] }));
    } catch (error) { throw error; }
  }

  async function rename(id, name) {
    if (legacySchema) return false;
    try {
      const res = await fetch(`${endpoint()}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: headers({ Prefer: "return=representation" }),
        body: JSON.stringify({ name: String(name).slice(0, 80) })
      });
      return res.ok && (await res.json()).length > 0;
    } catch (error) { return false; }
  }

  /* Needs the "shared delete" policy from migration 0002. */
  async function remove(id) {
    try {
      const res = await fetch(`${endpoint()}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers({ Prefer: "return=representation" })
      });
      return res.ok && (await res.json()).length > 0;
    } catch (error) { return false; }
  }

  function rowFor(people, at, options = {}) {
    const row = { id: options.id || listId(), people, updated_at: new Date(at || Date.now()).toISOString() };
    if (!legacySchema) {
      if (options.createdBy) row.created_by = String(options.createdBy).slice(0, 80);
      if (options.by) row.updated_by = String(options.by).slice(0, 80);
      if (options.name) row.name = String(options.name).slice(0, 80);
    }
    return row;
  }

  async function post(row) {
    let res = await fetch(endpoint(), {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify(row)
    });
    if (res.status === 400 && !legacySchema && (row.created_by === undefined && (row.updated_by !== undefined || row.name !== undefined))) {
      legacySchema = true;
      const { id, people, updated_at } = row;
      res = await fetch(endpoint(), {
        method: "POST",
        headers: headers({ Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify({ id, people, updated_at })
      });
    }
    return res.ok;
  }

  /* SAVE LIST AS: a new row under a fresh id. Resolves to the id or "". */
  async function create(name, people, by) {
    const slug = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "list";
    const id = `${slug}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      const ok = await post(rowFor(people, Date.now(), { id, name, by, createdBy: by }));
      return ok ? id : "";
    } catch (error) { return ""; }
  }

  /* Remember the timestamp of our own write so the poll does not echo it. */
  let lastSeen = 0;
  function rememberWrite(ms) { lastSeen = Math.max(lastSeen, Number(ms) || 0); }

  async function save(people, options = {}) {
    const row = rowFor(people, options.at, { by: options.by, name: options.name });
    // When the page is already closing, a fetch can be cancelled before it
    // lands; sendBeacon is built for exactly that moment.
    if (options.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify(row)], { type: "application/json" });
        if (navigator.sendBeacon(endpoint(), blob)) return true;
      } catch (error) { /* fall through to fetch */ }
    }
    try {
      return await post(row);
    } catch (error) {
      return false;
    }
  }

  /*
   * Poll for someone else's change. A changed updated_at triggers a reload;
   * the page decides whether it is safe to swap the list in without dropping
   * what the current person is typing.
   */
  let pollTimer = 0;
  function startPoll(onRemote) {
    if (pollTimer || !enabled()) return;
    pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`${byId()}&select=updated_at`, {
          method: "GET",
          headers: headers()
        });
        if (!res.ok) return;
        const rows = await res.json();
        const row = Array.isArray(rows) && rows.length ? rows[0] : null;
        const when = row && row.updated_at ? new Date(row.updated_at).getTime() : 0;
        if (!when || when === lastSeen) return;
        lastSeen = when;
        const full = await load();
        onRemote(full.people, full.updatedAt, full);
      } catch (error) { /* offline — the next tick tries again */ }
    }, POLL_MS);
  }

  return { enabled, listId, load, save, listAll, create, rename, remove, startPoll, rememberWrite };
})();
if (typeof window !== "undefined") window.SharedStore = SharedStore;
