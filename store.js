"use strict";

/* Browser-local lock screen and saved files, not server-side authentication. */
const Store = (function () {
  const USERS_KEY = "team-elite-users-v1";
  const DOCS_KEY = "team-elite-documents-v1";
  const SESSION_KEY = "team-elite-session-v1";
  const LEGACY_KEY = "team-elite-ph-tshirt-people-v2";
  const USED_KEY = "team-elite-ph-tshirt-used-v1";
  // Fixed team accounts. The pass field is already hashed (see hash below).
  const FIXED_PASS = "17vlux81jd9ixt";
  const FIXED_USERS = [
    { id: "fixed-joyce", name: "Joyce", pass: FIXED_PASS },
    { id: "fixed-stuts", name: "Stuts", pass: FIXED_PASS },
    { id: "fixed-gen", name: "Gen", pass: FIXED_PASS }
  ];
  const STORAGE_ERROR = "Could not save on this device. Check your browser storage and try again.";

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function read(key) {
    try { return JSON.parse(window.localStorage.getItem(key)); }
    catch (error) { return null; }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) { return false; }
  }

  function hash(text) {
    let h1 = 0x9dc5;
    let h2 = 0x811c9dc5;
    const value = String(text);
    for (let i = 0; i < value.length; i += 1) {
      const c = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`;
  }

  function clean(value, limit) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
  }

  function users() {
    const stored = read(USERS_KEY);
    const all = Array.isArray(stored) ? stored.slice() : [];
    // Make sure every fixed account is present with its fixed passcode,
    // whatever this device had stored before. FIXED_PASS is already hashed.
    let changed = false;
    FIXED_USERS.forEach((fixed) => {
      const found = all.find((user) => user.name.toLowerCase() === fixed.name.toLowerCase());
      if (!found) {
        all.push({ id: fixed.id, name: fixed.name, pass: fixed.pass, createdAt: Date.now() });
        changed = true;
      } else if (found.pass !== fixed.pass) {
        found.pass = fixed.pass;
        changed = true;
      }
    });
    if (changed || !Array.isArray(stored)) write(USERS_KEY, all);
    return all;
  }

  function checkLogin(name, pass) {
    const key = String(name || "").trim().toLowerCase();
    if (!key || !pass) return null;
    return users().find((user) => user.name.toLowerCase() === key && user.pass === hash(pass)) || null;
  }

  function addUser(name, pass) {
    name = clean(name, 40);
    if (!name) return { ok: false, error: "Give your name." };
    if (!pass || !String(pass).trim()) return { ok: false, error: "Choose a passcode." };
    if (String(pass).length > 60) return { ok: false, error: "Use a passcode of 60 characters or fewer." };
    const all = users();
    if (all.some((user) => user.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: "That name is already on this device. Sign in instead." };
    }
    all.push({ id: uid(), name, pass: hash(pass), createdAt: Date.now() });
    return write(USERS_KEY, all) ? { ok: true, error: "" } : { ok: false, error: STORAGE_ERROR };
  }

  // Call with the user's id and their new passcode.
  function changePass(id, pass) {
    if (!pass || !String(pass).trim() || String(pass).length > 60) {
      return { ok: false, error: "Choose a passcode of 1 to 60 characters." };
    }
    const all = users();
    const user = all.find((item) => item.id === id);
    if (!user) return { ok: false, error: "That person is not on this device." };
    user.pass = hash(pass);
    return write(USERS_KEY, all) ? { ok: true, error: "" } : { ok: false, error: STORAGE_ERROR };
  }

  function session() {
    const saved = read(SESSION_KEY);
    return saved && typeof saved.id === "string" && saved.id
      && typeof saved.name === "string" && saved.name ? saved : null;
  }

  function signIn(user) {
    if (!user) return false;
    return write(SESSION_KEY, { id: user.id, name: user.name, at: Date.now() });
  }

  function signOut() {
    try { window.localStorage.removeItem(SESSION_KEY); return true; }
    catch (error) { return false; }
  }

  function requireSession() {
    const me = session();
    if (!me) window.location.replace("login.html");
    return me;
  }

  function docs() {
    const stored = read(DOCS_KEY);
    if (Array.isArray(stored)) return stored;
    const legacy = read(LEGACY_KEY);
    const now = Date.now();
    const first = Array.isArray(legacy) && legacy.length
      ? [{ id: uid(), name: "Main list", owner: "", createdAt: now, updatedAt: now, people: legacy }]
      : [];
    write(DOCS_KEY, first);
    return first;
  }

  function doc(id) { return docs().find((item) => item.id === id) || null; }

  function currentDocId() {
    const match = /[?&]doc=([^&]+)/.exec(window.location.search);
    try { return match ? decodeURIComponent(match[1]) : ""; }
    catch (error) { return ""; }
  }

  function createDoc(name, owner) {
    name = clean(name, 60);
    if (!name) return { ok: false, error: "Give the file a name." };
    const all = docs();
    if (all.length >= 200) return { ok: false, error: "This device already has 200 files. Delete one before adding another." };
    const now = Date.now();
    const created = { id: uid(), name, owner: String(owner || ""), createdAt: now, updatedAt: now, people: [] };
    all.unshift(created);
    return write(DOCS_KEY, all)
      ? { ok: true, error: "", doc: created } : { ok: false, error: STORAGE_ERROR };
  }

  function updateDoc(id, people, by) {
    const all = docs();
    const target = all.find((item) => item.id === id);
    if (!target || !Array.isArray(people)) return false;
    target.people = people;
    target.updatedAt = Date.now();
    if (by) target.updatedBy = String(by).slice(0, 40);
    return write(DOCS_KEY, all);
  }

  function renameDoc(id, name) {
    name = clean(name, 60);
    if (!name) return { ok: false, error: "Give the file a name." };
    const all = docs();
    const target = all.find((item) => item.id === id);
    if (!target) return { ok: false, error: "That file is no longer here." };
    target.name = name;
    target.updatedAt = Date.now();
    return write(DOCS_KEY, all) ? { ok: true, error: "" } : { ok: false, error: STORAGE_ERROR };
  }

  function deleteDoc(id) {
    const all = docs();
    if (!all.some((item) => item.id === id)) return false;
    return write(DOCS_KEY, all.filter((item) => item.id !== id));
  }

  function touchDevice() { return write(USED_KEY, 1); }
  function deviceHasHeldAList() { return read(USED_KEY) === 1; }
  function formatDate(v) {
    return new Date(v).toLocaleString("en-PH", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function relative(v) {
    const minutes = Math.floor((Date.now() - Number(v)) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return formatDate(v);
  }

  return { users, checkLogin, addUser, changePass, session, signIn, signOut, requireSession,
    docs, doc, currentDocId, createDoc, updateDoc, renameDoc, deleteDoc,
    touchDevice, deviceHasHeldAList, formatDate, relative, hash };
})();
if (typeof window !== "undefined") window.Store = Store;
