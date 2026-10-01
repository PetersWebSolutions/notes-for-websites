"use strict";

/*
 * Shared list backend for Supabase. When supabase-config.js holds a project
 * URL and anon key, the tally reads and writes ONE shared list that every
 * visitor sees, instead of this browser's private storage. With no URL this
 * file stays quiet and the site keeps its device-local behavior.
 *
 * Each list lives in one row of the shared_lists table:
 *   id (text), people (jsonb), updated_at (timestamptz),
 *   name (text), updated_by (text), created_by (text)
 *
 * The ownership column is required for writes. If it is missing, the page may
 * still display older lists as view-only and shows an actionable migration
 * message; it never silently makes ownerless lists editable. Existing rows with
 * a NULL created_by stay view-only until an administrator assigns their maker.
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

  /* One meta row for the picker: { id, name, updatedAt, updatedBy, createdBy }. */
  function meta(row) {
    return {
      id: String(row.id),
      name: row.name ? String(row.name) : (row.id === "main" ? "Shared list" : String(row.id)),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
      updatedBy: row.updated_by ? String(row.updated_by) : "",
      createdBy: row.created_by ? String(row.created_by) : ""
    };
  }

  const OWNER_SCHEMA_ERROR = "List ownership is not set up in Supabase. Run migrations 0001_shared_lists.sql, 0002_list_names_and_editor.sql, and 0003_list_owner.sql in order, then reload.";
  const EXTRA_COLS = ",name,updated_by,created_by";
  let ownerTrackingAvailable = true;
  // Client-side guard against accidental cross-owner writes; real protection
  // still requires Supabase Auth plus RLS policies on the server.
  const ownerById = new Map();

  function identity(value) { return String(value || "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function rememberOwner(id, owner) { ownerById.set(String(id), identity(owner)); }
  function canEdit(id, by) {
    const owner = ownerById.get(String(id)) || "";
    const current = identity(by);
    return Boolean(ownerTrackingAvailable && owner && current && owner === current);
  }
  function ownershipReady() { return ownerTrackingAvailable; }
  function ownershipMessage() { return ownerTrackingAvailable ? "" : OWNER_SCHEMA_ERROR; }

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
    let activeQuery = query;
    let res = await fetch(`${endpoint()}?${activeQuery}`, { method: "GET", headers: headers() });
    if (res.status === 400 && /created_by/.test(query)) {
      // Older databases may still be readable, but without a maker field they
      // are view-only. Retry reads without optional metadata; never infer an
      // owner or allow a write when this fallback is used.
      ownerTrackingAvailable = false;
      activeQuery = query.replace(/,created_by/g, "");
      res = await fetch(`${endpoint()}?${activeQuery}`, { method: "GET", headers: headers() });
      if (res.status === 400 && /(?:,name|,updated_by)/.test(activeQuery)) {
        activeQuery = activeQuery.replace(/,name|,updated_by/g, "");
        res = await fetch(`${endpoint()}?${activeQuery}`, { method: "GET", headers: headers() });
      }
    }
    if (!res.ok) throw new Error(`Shared list load failed (${res.status}).`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function load() {
    const rows = await getRows(`id=eq.${encodeURIComponent(listId())}&select=people,updated_at,name,updated_by,created_by`);
    const row = rows.length ? rows[0] : null;
    const info = row ? meta(Object.assign({ id: listId() }, row)) : meta({ id: listId() });
    rememberOwner(info.id, info.createdBy);
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
      const lists = rows.map((row) => Object.assign(meta(row), { people: Array.isArray(row.people) ? row.people : [] }));
      lists.forEach((list) => rememberOwner(list.id, list.createdBy));
      return lists;
    } catch (error) { throw error; }
  }

  async function rename(id, name, by) {
    if (!canEdit(id, by)) return false;
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
  async function remove(id, by) {
    if (!canEdit(id, by)) return false;
    try {
      const res = await fetch(`${endpoint()}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers({ Prefer: "return=representation" })
      });
      const deleted = res.ok && (await res.json()).length > 0;
      if (deleted) ownerById.delete(String(id));
      return deleted;
    } catch (error) { return false; }
  }

  function rowFor(people, at, options = {}) {
    const row = { id: options.id || listId(), people, updated_at: new Date(at || Date.now()).toISOString() };
    if (options.createdBy) row.created_by = String(options.createdBy).trim().replace(/\s+/g, " ").slice(0, 80);
    if (options.by) row.updated_by = String(options.by).trim().replace(/\s+/g, " ").slice(0, 80);
    if (options.name) row.name = String(options.name).slice(0, 80);
    return row;
  }

  async function post(row) {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify(row)
    });
    // No compatibility retry without created_by: that would create an
    // unowned list which no one can safely edit later.
    return res.ok;
  }

  /* SAVE LIST AS: a new row under a fresh id. Resolves to the id or "". */
  async function create(name, people, by) {
    const maker = String(by || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!maker || !ownerTrackingAvailable) return "";
    const slug = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "list";
    const id = `${slug}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      const ok = await post(rowFor(people, Date.now(), { id, name, by: maker, createdBy: maker }));
      if (!ok) return "";
      rememberOwner(id, maker);
      return id;
    } catch (error) { return ""; }
  }

  /* Remember the timestamp of our own write so the poll does not echo it. */
  let lastSeen = 0;
  function rememberWrite(ms) { lastSeen = Math.max(lastSeen, Number(ms) || 0); }

  async function save(people, options = {}) {
    if (!canEdit(listId(), options.by)) return false;
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

  return { enabled, listId, load, save, listAll, create, rename, remove, startPoll, rememberWrite, ownershipReady, ownershipMessage };
})();
if (typeof window !== "undefined") window.SharedStore = SharedStore;
