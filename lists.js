"use strict";
(function () {
  const me = Store.session();
  if (!me) { window.location.replace("login.html"); return; }
  /* Shared mode: the lists live in Supabase and everyone sees the same ones. */
  const SHARED = Boolean(window.SharedStore && window.SharedStore.enabled());
  let sharedLists = [];
  const list = document.getElementById("file-list");
  const fileName = document.getElementById("file-name");
  const fileError = document.getElementById("file-error");
  const personName = document.getElementById("person-name");
  const personPass = document.getElementById("person-pass");
  const personError = document.getElementById("person-error");
  const peopleHere = document.getElementById("people-here");
  const modal = document.getElementById("confirm-modal");
  const live = document.getElementById("live");
  const toast = document.getElementById("toast");
  let toastTimer;
  let confirmHandler = null;
  let returnFocus = null;

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = String(value);
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    function append(child) {
      if (child == null || child === false) return;
      if (Array.isArray(child)) { child.forEach(append); return; }
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    children.forEach(append);
    return node;
  }
  function setError(el, msg) { el.textContent = msg; el.hidden = !msg; }
  function announce(msg) {
    live.textContent = "";
    window.setTimeout(() => { live.textContent = msg; }, 30);
  }
  function showToast(msg) {
    window.clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3800);
    announce(msg);
  }
  function fileCounts(doc) {
    const people = Array.isArray(doc.people) ? doc.people : [];
    return { people: people.length, shirts: people.reduce((total, person) => total
      + (Array.isArray(person.items) ? person.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : 0), 0) };
  }
  function countsLabel(doc) {
    const count = fileCounts(doc);
    return `${count.people} ${count.people === 1 ? "person" : "people"} · ${count.shirts} ${count.shirts === 1 ? "shirt" : "shirts"}`;
  }
  function allDocs() {
    if (SHARED) return sharedLists.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return Store.docs().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  function findDoc(id) {
    return SHARED ? sharedLists.find((doc) => doc.id === id) || null : Store.doc(id);
  }
  function openHref(doc) {
    return SHARED ? `index.html?list=${encodeURIComponent(doc.id)}` : `index.html?doc=${encodeURIComponent(doc.id)}`;
  }
  function ownerKey(value) { return String(value || "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function canEdit(doc) {
    const owner = ownerKey(SHARED ? doc && doc.createdBy : doc && doc.owner);
    const current = ownerKey(me && me.name);
    if (!owner) return !SHARED; // shared rows fail closed; keep ownerless local legacy files usable
    return Boolean(current && owner === current);
  }
  function render() {
    const docs = allDocs();
    document.getElementById("who").textContent = `Signed in as ${me.name}`;
    document.getElementById("files-title").textContent = SHARED ? "Saved lists" : "Saved files";
    document.getElementById("files-count").textContent = docs.length
      ? `${docs.length} ${SHARED ? "list" : "file"}${docs.length === 1 ? "" : "s"}${SHARED ? " saved online" : " on this device"}`
      : "Nothing saved yet";
    document.getElementById("files-empty").hidden = !!docs.length;
    list.hidden = !docs.length;
    list.replaceChildren(...docs.map((doc) => {
      const who = SHARED ? doc.updatedBy : doc.updatedBy || doc.owner;
      const mine = canEdit(doc);
      const maker = String(doc.createdBy || "").trim();
      const ownerMeta = SHARED
        ? (ownerKey(maker) ? (mine ? `Made by ${maker} · you can edit` : `Made by ${maker} · view only`) : "Owner not recorded · view only")
        : (doc.owner ? (mine ? `Made by ${doc.owner} · you can edit` : `Made by ${doc.owner} · view only`) : "");
      return h("li", { class: "file-item" },
        h("div", { class: "file-info" },
          h("h3", { class: "file-name", text: doc.name }),
          h("p", { class: "file-meta", text: countsLabel(doc) + (ownerMeta ? ` · ${ownerMeta}` : "") }),
          h("p", { class: "file-time" }, who ? `Last modified by ${who} · ` : "Last modified ",
            h("strong", { text: Store.formatDate(doc.updatedAt) }),
            h("span", { class: "file-rel", text: ` · ${Store.relative(doc.updatedAt)}` }))),
        h("div", { class: "file-actions" },
          h("a", { class: "add-btn file-open", href: openHref(doc), text: mine ? "OPEN" : "VIEW", "aria-label": `${mine ? "Open" : "View"} ${doc.name}` }),
          mine && h("button", { type: "button", class: "ghost-btn", "data-rename": doc.id, text: "Rename", "aria-label": `Rename ${doc.name}` }),
          mine && h("button", { type: "button", class: "ghost-btn danger", "data-delete": doc.id, text: "Delete", "aria-label": `Delete ${doc.name}` })));
    }));
  }
  async function loadShared() {
    const err = document.getElementById("files-load-error");
    err.hidden = true;
    document.getElementById("files-count").textContent = "Loading the saved lists…";
    try {
      sharedLists = await SharedStore.listAll({ withPeople: true });
      render();
      if (typeof SharedStore.ownershipReady === "function" && !SharedStore.ownershipReady()) {
        err.textContent = SharedStore.ownershipMessage();
        err.hidden = false;
        document.getElementById("new-file-btn").disabled = true;
        fileName.disabled = true;
      }
    } catch (error) {
      render();
      const setupError = error && /migration/i.test(error.message || "") ? error.message : "Could not load the saved lists. Check your connection and refresh.";
      err.textContent = setupError;
      err.hidden = false;
      if (/migration/i.test(setupError)) {
        document.getElementById("new-file-btn").disabled = true;
        fileName.disabled = true;
      }
    }
  }
  function showPeople() { peopleHere.textContent = `On this device: ${Store.users().map((user) => user.name).join(", ")}`; }
  function openConfirm(doc) {
    if (!canEdit(doc)) return;
    returnFocus = document.activeElement;
    document.getElementById("confirm-title").textContent = `Delete ${doc.name}?`;
    document.getElementById("confirm-body").textContent = `This removes ${countsLabel(doc)} from “${doc.name}”. This cannot be undone. Keep a backup first if you need one.`;
    document.getElementById("confirm-ok").textContent = "Delete file";
    confirmHandler = async () => {
      if (SHARED) {
        if (!(await SharedStore.remove(doc.id, me.name))) { showToast("Could not delete this list online. Try again."); return; }
        sharedLists = sharedLists.filter((item) => item.id !== doc.id);
      } else if (!Store.deleteDoc(doc.id)) { showToast("Could not delete this file. Try again."); return; }
      render();
      showToast(`Deleted ${doc.name}.`);
    };
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("confirm-cancel").focus();
  }
  function closeConfirm() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    confirmHandler = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    else fileName.focus();
  }

  document.getElementById("new-file").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (SHARED) {
      const name = String(fileName.value || "").trim().replace(/\s+/g, " ").slice(0, 60);
      if (!name) { setError(fileError, "Give the list a name."); announce("Give the list a name."); return; }
      const button = document.getElementById("new-file-btn");
      button.disabled = true;
      const id = await SharedStore.create(name, [], me.name);
      button.disabled = false;
      if (!id) { setError(fileError, "Could not save the new list online. Check your connection and try again."); return; }
      setError(fileError, "");
      fileName.value = "";
      sharedLists.unshift({ id, name, people: [], updatedAt: Date.now(), updatedBy: me.name, createdBy: me.name });
      render();
      showToast(`Created ${name}.`);
      fileName.focus();
      return;
    }
    const result = Store.createDoc(fileName.value, me.name);
    if (!result.ok) { setError(fileError, result.error); announce(result.error); return; }
    setError(fileError, "");
    fileName.value = "";
    render();
    showToast(`Created ${result.doc.name}.`);
    fileName.focus();
  });
  fileName.addEventListener("input", () => setError(fileError, ""));
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rename], [data-delete]");
    if (!button) return;
    const doc = findDoc(button.dataset.rename || button.dataset.delete);
    if (!doc || !canEdit(doc)) { render(); return; }
    if (button.hasAttribute("data-rename")) {
      const name = window.prompt(SHARED ? "New name for this list" : "New name for this file", doc.name);
      if (name === null) return;
      if (SHARED) {
        const cleaned = String(name).trim().replace(/\s+/g, " ").slice(0, 60);
        if (!cleaned) { setError(fileError, "Give the list a name."); return; }
        if (!(await SharedStore.rename(doc.id, cleaned, me.name))) { setError(fileError, "Could not rename the list online. Try again."); return; }
        doc.name = cleaned;
        setError(fileError, "");
        render();
        showToast("List renamed.");
        return;
      }
      const result = Store.renameDoc(doc.id, name);
      if (!result.ok) { setError(fileError, result.error); announce(result.error); return; }
      setError(fileError, "");
      render();
      showToast("File renamed.");
    } else openConfirm(doc);
  });
  document.getElementById("signout-btn").addEventListener("click", () => {
    // Flush any pending tally save first. Sign-out itself only removes the
    // session key and never touches the saved files.
    if (typeof window.flushPendingSaves === "function") window.flushPendingSaves();
    if (!Store.signOut()) { showToast("Could not sign out. Check your browser storage and try again."); return; }
    window.location.replace("login.html");
  });
  document.getElementById("add-person-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = Store.addUser(personName.value, personPass.value);
    if (!result.ok) { setError(personError, result.error); announce(result.error); return; }
    setError(personError, "");
    personName.value = "";
    personPass.value = "";
    showPeople();
    showToast("Person added to this device.");
  });
  [personName, personPass].forEach((input) => input.addEventListener("input", () => setError(personError, "")));
  document.getElementById("confirm-cancel").addEventListener("click", closeConfirm);
  document.getElementById("confirm-ok").addEventListener("click", () => {
    const action = confirmHandler;
    if (action) action();
    closeConfirm();
  });
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeConfirm));
  document.addEventListener("keydown", (event) => {
    if (modal.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closeConfirm(); }
    if (event.key === "Tab") {
      const first = document.getElementById("confirm-cancel");
      const last = document.getElementById("confirm-ok");
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  if (SHARED) {
    document.body.classList.add("shared-mode");
    document.querySelectorAll(".files-shared-only").forEach((el) => { el.hidden = false; });
    fileName.placeholder = "Name for the new list, e.g. Batch 2 orders";
    document.getElementById("new-file-btn").textContent = "NEW LIST";
    document.querySelector("#files-empty h3").textContent = "No lists yet";
    document.querySelector("#files-empty p").textContent = "Name your first list above, then open it to start a tally.";
    render();
    loadShared();
  } else {
    showPeople();
    render();
  }
})();
