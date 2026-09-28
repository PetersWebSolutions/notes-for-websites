"use strict";

/*
 * Shared list backend for Supabase. When supabase-config.js holds a project
 * URL and anon key, the tally reads and writes ONE shared list that every
 * visitor sees, instead of this browser's private storage. With no URL this
 * file stays quiet and the site keeps its device-local behavior.
 *
 * The whole list lives in one row of the shared_lists table:
 *   id (text), people (jsonb), updated_at (timestamptz)
 *
 * Plain fetch against Supabase's REST (PostgREST) API — no SDK, no build.
 */
const SharedStore = (function () {
  const config = (typeof window !== "undefined" && window.SUPABASE_CONFIG) || {};
  const POLL_MS = 5000;

  function url() { return String(config.url || "").replace(/\/+$/, ""); }
  function enabled() { return /^https?:\/\//.test(url()) && Boolean(config.anonKey); }
  function listId() { return String(config.listId || "main"); }

  function headers(extra) {
    return Object.assign({
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json"
    }, extra || {});
  }

  function endpoint() { return `${url()}/rest/v1/shared_lists`; }
  function byId() { return `${endpoint()}?id=eq.${encodeURIComponent(listId())}`; }

  async function load() {
    const res = await fetch(`${byId()}&select=people,updated_at`, {
      method: "GET",
      headers: headers()
    });
    if (!res.ok) throw new Error(`Shared list load failed (${res.status}).`);
    const rows = await res.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return {
      people: row && Array.isArray(row.people) ? row.people : [],
      updatedAt: row && row.updated_at ? new Date(row.updated_at).getTime() : 0
    };
  }

  function rowFor(people, at) {
    return { id: listId(), people, updated_at: new Date(at || Date.now()).toISOString() };
  }

  /* Remember the timestamp of our own write so the poll does not echo it. */
  let lastSeen = 0;
  function rememberWrite(ms) { lastSeen = Math.max(lastSeen, Number(ms) || 0); }

  async function save(people, options = {}) {
    const row = rowFor(people, options.at);
    // When the page is already closing, a fetch can be cancelled before it
    // lands; sendBeacon is built for exactly that moment.
    if (options.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify(row)], { type: "application/json" });
        if (navigator.sendBeacon(endpoint(), blob)) return true;
      } catch (error) { /* fall through to fetch */ }
    }
    try {
      const res = await fetch(endpoint(), {
        method: "POST",
        headers: headers({ Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify(row)
      });
      return res.ok;
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
        onRemote(full.people, full.updatedAt);
      } catch (error) { /* offline — the next tick tries again */ }
    }, POLL_MS);
  }

  return { enabled, listId, load, save, startPoll, rememberWrite };
})();
if (typeof window !== "undefined") window.SharedStore = SharedStore;
