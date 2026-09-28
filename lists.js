"use strict";
(function () {
  const me = Store.session();
  if (!me) { window.location.replace("login.html"); return; }
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
  function render() {
    const docs = Store.docs().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    document.getElementById("who").textContent = `Signed in as ${me.name}`;
    document.getElementById("files-count").textContent = docs.length
      ? `${docs.length} file${docs.length === 1 ? "" : "s"} on this device` : "Nothing saved yet";
    document.getElementById("files-empty").hidden = !!docs.length;
    list.hidden = !docs.length;
    list.replaceChildren(...docs.map((doc) => h("li", { class: "file-item" },
      h("div", { class: "file-info" },
        h("h3", { class: "file-name", text: doc.name }),
        h("p", { class: "file-meta", text: countsLabel(doc) + (doc.owner ? ` · by ${doc.owner}` : "") }),
        h("p", { class: "file-time" }, "Last modified ", h("strong", { text: Store.formatDate(doc.updatedAt) }),
          h("span", { class: "file-rel", text: ` · ${Store.relative(doc.updatedAt)}` }))),
      h("div", { class: "file-actions" },
        h("a", { class: "add-btn file-open", href: `index.html?doc=${encodeURIComponent(doc.id)}`, text: "OPEN", "aria-label": `Open ${doc.name}` }),
        h("button", { type: "button", class: "ghost-btn", "data-rename": doc.id, text: "Rename", "aria-label": `Rename ${doc.name}` }),
        h("button", { type: "button", class: "ghost-btn danger", "data-delete": doc.id, text: "Delete", "aria-label": `Delete ${doc.name}` }))
    )));
  }
  function showPeople() { peopleHere.textContent = `On this device: ${Store.users().map((user) => user.name).join(", ")}`; }
  function openConfirm(doc) {
    returnFocus = document.activeElement;
    document.getElementById("confirm-title").textContent = `Delete ${doc.name}?`;
    document.getElementById("confirm-body").textContent = `This removes ${countsLabel(doc)} from “${doc.name}”. This cannot be undone. Keep a backup first if you need one.`;
    document.getElementById("confirm-ok").textContent = "Delete file";
    confirmHandler = () => {
      if (!Store.deleteDoc(doc.id)) { showToast("Could not delete this file. Try again."); return; }
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

  document.getElementById("new-file").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = Store.createDoc(fileName.value, me.name);
    if (!result.ok) { setError(fileError, result.error); announce(result.error); return; }
    setError(fileError, "");
    fileName.value = "";
    render();
    showToast(`Created ${result.doc.name}.`);
    fileName.focus();
  });
  fileName.addEventListener("input", () => setError(fileError, ""));
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rename], [data-delete]");
    if (!button) return;
    const doc = Store.doc(button.dataset.rename || button.dataset.delete);
    if (!doc) { render(); return; }
    if (button.hasAttribute("data-rename")) {
      const name = window.prompt("New name for this file", doc.name);
      if (name === null) return;
      const result = Store.renameDoc(doc.id, name);
      if (!result.ok) { setError(fileError, result.error); announce(result.error); return; }
      setError(fileError, "");
      render();
      showToast("File renamed.");
    } else openConfirm(doc);
  });
  document.getElementById("signout-btn").addEventListener("click", () => {
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
  showPeople();
  render();
})();
