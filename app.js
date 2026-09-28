"use strict";

/*
 * Bump this whenever shipped files change. It is printed at the bottom of the list
 * so a screenshot always says which build is actually running, and it matches
 * the ?v= token on all three pages. Storage is scoped to the open file.
 */
const BUILD = "f7bce4";

const Tally = window.Tally;
const DOC = window.Store ? Store.doc(Store.currentDocId()) : null;

const addForm = document.getElementById("add-form");
const nameInput = document.getElementById("name-input");
const sizeInput = document.getElementById("size-input");
const qtyInput = document.getElementById("qty-input");
const searchInput = document.getElementById("search");
const sortEl = document.getElementById("sort-orders");
const toastEl = document.getElementById("toast");
const liveEl = document.getElementById("live");
const tbody = document.getElementById("order-body");

/* Shirts waiting to be attached to a person. */
let cart = [];
/* The one row whose quantities can be changed right now, or null. */
let editingId = null;
/* On phones each person starts as one row; these ids have the size grid open. */
const expandedIds = new Set();

let people = [];
let filter = "all";
let sortMode = "entry";
let query = "";
let highlightId = null;
let pendingNotice = "";
let lastTotal = null;
let toastTimer = 0;
let saveTimer = 0;
let modalReturnFocus = null;
let confirmHandler = null;
let extraHandler = null;
let printSnapshot = null;

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, value === true ? "" : String(value));
  });
  children.forEach((child) => append(node, child));
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((item) => append(node, item));
    return;
  }
  node.append(child instanceof Node ? child : document.createTextNode(String(child)));
}

function colorLabel(color, upper) {
  const label = color === "blue" ? "Blue" : "White";
  return upper ? label.toUpperCase() : label;
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stamp(date = new Date()) {
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function fileDate() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getRadio(form, name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function findPerson(id) {
  return people.find((person) => person.id === id) || null;
}

function hasColor(person, color) {
  return Tally.normalizeItems(person.items).some((item) => item.color === color);
}

/* ---------- storage ---------- */

function loadPeople() {
  if (!DOC) return [];
  try {
    const arr = Array.isArray(DOC.people) ? DOC.people : [];
    const restored = [];
    let skipped = 0;
    arr.forEach((item) => {
      // The oldest backups stored one shirt per row ({ name, size, color,
      // paid }). Migrate them like restore does, or their shirts would be
      // dropped when the file opens.
      const legacy = item && item.size != null && item.color != null && !item.items && !item.white && !item.blue;
      const person = legacy
        ? Tally.migrateLegacyOrder(item, uid)
        : Tally.normalizePerson(item, uid);
      if (person) restored.push(person);
      else skipped += 1;
    });
    if (skipped) pendingNotice = "Some saved rows were skipped because they were incomplete.";
    return restored.slice(0, Tally.MAX_PEOPLE);
  } catch (error) {
    pendingNotice = "Could not read the saved list. Starting fresh on this device.";
    return [];
  }
}

function savePeople() {
  if (!DOC) return false;
  const state = document.getElementById("save-state");
  try {
    if (!Store.updateDoc(DOC.id, people)) throw new Error("no such file");
    if (people.length) Store.touchDevice();
    const saved = Store.doc(DOC.id);
    if (saved) Object.assign(DOC, saved);
    showOpenFile();
    state.classList.remove("is-error");
    state.textContent = `Saved in ${DOC.name} · ${stamp()}`;
    return true;
  } catch (error) {
    state.classList.add("is-error");
    state.textContent = "Could not save on this device. Export a backup before you leave.";
    return false;
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(savePeople, 400);
}

/*
 * Write any debounced save immediately. Runs on pagehide and
 * visibilitychange, and on sign-out (via window.flushPendingSaves) before
 * the session is dropped, so a pending keystroke can never be lost.
 */
function flushPendingSave() {
  if (!saveTimer) return;
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  savePeople();
}
window.flushPendingSaves = flushPendingSave;

function saveNow() {
  window.clearTimeout(saveTimer);
  const ok = savePeople();
  if (ok) {
    flashSaved();
    showToast("List saved on this device. It will be here when you come back.");
    announce(`List saved. ${Tally.peopleLabel(people.length)} on the list.`);
  } else {
    showToast("Could not save on this device. Export a backup before you leave.");
  }
}

/* A short "Saved" tick next to the button, so saving feels immediate. */
let chipTimer = 0;
function flashSaved() {
  const chip = document.getElementById("save-chip");
  if (!chip) return;
  window.clearTimeout(chipTimer);
  chip.hidden = false;
  chipTimer = window.setTimeout(() => { chip.hidden = true; }, 2200);
}

/*
 * The explicit UPDATE LIST button at the bottom of the page. It force-writes
 * the people array to the open file right now and confirms it three ways:
 * the button flips to "Saved ✓", the line below gains a timestamp, and the
 * toast appears. With no file open it writes nothing and points to Files.
 */
let updateTimer = 0;
function updateList() {
  const button = document.getElementById("update-list-btn");
  const when = document.getElementById("update-when");
  if (!DOC || !Store.doc(DOC.id)) {
    when.classList.add("is-error");
    when.textContent = "No file is open here. Go to the Files page and open a file before saving.";
    showToast("No file is open here. Go to the Files page and open a file to save the list.", "Go to Files", () => {
      window.location.assign("lists.html");
    });
    announce("No file is open. Open a file on the Files page to save the list.");
    return;
  }
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  if (!savePeople()) {
    when.classList.add("is-error");
    when.textContent = "Could not save on this device. Export a backup before you leave.";
    showToast("Could not save on this device. Export a backup before you leave.");
    return;
  }
  flashSaved();
  when.classList.remove("is-error");
  when.textContent = `Last saved ${stamp()}`;
  window.clearTimeout(updateTimer);
  button.textContent = "Saved ✓";
  button.classList.add("is-saved");
  updateTimer = window.setTimeout(() => {
    button.textContent = "UPDATE LIST";
    button.classList.remove("is-saved");
  }, 2200);
  showToast("List saved on this device. It will be here when you come back.");
  announce(`List saved in ${DOC.name}. ${Tally.peopleLabel(people.length)} on the list.`);
}

/*
 * This device held a list before but is showing an empty one, so the stored
 * data was cleared or evicted. Say so instead of quietly starting over.
 */
function checkStorageLoss() {
  if (!Store.deviceHasHeldAList() || people.length) return;
  const note = document.getElementById("recover-note");
  if (note) note.hidden = false;
}

function announce(message) {
  liveEl.textContent = "";
  window.setTimeout(() => {
    liveEl.textContent = message;
  }, 30);
}

function showToast(message, actionLabel, onAction) {
  window.clearTimeout(toastTimer);
  toastEl.replaceChildren(document.createTextNode(message));
  if (actionLabel && onAction) {
    const button = h("button", { type: "button", class: "toast-action", text: actionLabel });
    button.addEventListener("click", () => {
      hideToast();
      onAction();
    });
    toastEl.append(button);
  }
  toastEl.hidden = false;
  toastTimer = window.setTimeout(hideToast, actionLabel ? 10000 : 3800);
}

function hideToast() {
  toastEl.hidden = true;
  toastEl.replaceChildren();
}

function setFormError(id, message) {
  const el = document.getElementById(id);
  el.hidden = !message;
  el.textContent = message || "";
  if (message && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/* ---------- the order form and the cart ---------- */

function fillSizeOptions() {
  sizeInput.append(h("option", { value: "", text: "—" }));
  Tally.SIZES.forEach((size) => sizeInput.append(
    h("option", { value: size, text: size })
  ));
  sizeInput.addEventListener("change", updateSizeHelp);
  updateSizeHelp();
}

function updateSizeHelp() {
  const size = sizeInput.value;
  const help = document.getElementById("size-help");
  help.textContent = Tally.isSize(size)
    ? `${Tally.formatPesos(Tally.priceFor(size))} each`
    : "Price follows the size";
}

function addToCart(event) {
  event.preventDefault();
  const size = sizeInput.value;
  if (!Tally.isSize(size)) {
    setFormError("form-error", "Pick a size from S to 4XL first.");
    sizeInput.focus();
    return;
  }
  const color = getRadio(addForm, "color") === "blue" ? "blue" : "white";
  const qty = Math.max(1, Tally.clampQty(qtyInput.value) || 1);

  cart = Tally.addItem(cart, { color, size, qty });
  setFormError("form-error", "");
  renderCart();
  announce(`${colorLabel(color)} ${size} ×${qty} added to the cart. ${Tally.shirtsLabel(Tally.itemsShirts(cart))} in the cart.`);
  qtyInput.value = "1";
  qtyInput.focus();
}

function addPersonToList() {
  if (people.length >= Tally.MAX_PEOPLE) {
    setFormError("form-error", "The list is full at 300 people. Remove someone to add another.");
    return;
  }
  const name = Tally.cleanName(nameInput.value);
  if (!Tally.isValidName(name)) {
    setFormError("form-error", "Enter the person's name before adding them to the list.");
    nameInput.focus();
    return;
  }
  if (!cart.length) {
    setFormError("form-error", "Add at least one shirt with the ADD button first.");
    sizeInput.focus();
    return;
  }

  const dup = people.some((person) => person.name.toLowerCase() === name.toLowerCase());
  if (dup && addForm.dataset.confirmDup !== "1") {
    addForm.dataset.confirmDup = "1";
    setFormError("form-error", `${name} is already on the list. Press ADD TO LIST again to add another person with the same name.`);
    return;
  }

  const items = Tally.normalizeItems(cart);
  const person = {
    id: uid(),
    name,
    items,
    paid: false,
    createdAt: Date.now()
  };
  people.push(person);
  const count = items.length;
  cart = [];
  nameInput.value = "";
  sizeInput.value = "";
  qtyInput.value = "1";
  delete addForm.dataset.confirmDup;
  savePeople();
  highlightId = person.id;
  editingId = null;
  render({ keepScroll: false });
  setFormError("form-error", "");
  updateDupHint("");
  updateSizeHelp();
  renderCart();
  const summary = Tally.summarize(people);
  announce(`Added ${person.name} with ${count} ${count === 1 ? "shirt" : "shirts"}. ${Tally.peopleLabel(summary.count)} on the list, ${Tally.shirtsLabel(summary.shirts)}.`);
  const hiddenByFilter = isFiltered() && !visiblePeople().some((item) => item.id === person.id);
  if (hiddenByFilter) showToast(`Added ${person.name}. Clear the filter to see them in the list.`);
  nameInput.focus();
}

function clearCart() {
  if (!cart.length) return;
  const shirts = Tally.itemsShirts(cart);
  cart = [];
  renderCart();
  announce(`Cart emptied. ${Tally.shirtsLabel(shirts)} removed.`);
  sizeInput.focus();
}

function renderCart() {
  const items = Tally.normalizeItems(cart);
  const list = document.getElementById("cart-list");

  document.getElementById("cart-count").textContent = Tally.shirtsLabel(Tally.itemsShirts(items));
  document.getElementById("cart-total").textContent = Tally.formatPesos(Tally.itemsPrice(items));
  document.getElementById("cart-empty").hidden = items.length > 0;
  document.getElementById("cart-clear").hidden = items.length === 0;
  list.hidden = items.length === 0;
  list.replaceChildren(...items.map((item) => {
    const key = `${item.color}|${item.size}`;
    return h("li", { class: "cart-item" },
      h("span", { class: `cart-swatch is-${item.color}`, "aria-hidden": "true" }),
      h("span", { class: "cart-color", text: colorLabel(item.color, true) }),
      h("span", { class: "cart-size", text: item.size }),
      h("span", { class: "cart-x", text: "×" }),
      h("input", {
        class: "cart-qty",
        type: "number",
        min: "0",
        max: String(Tally.MAX_QTY),
        step: "1",
        inputmode: "numeric",
        value: String(item.qty),
        "data-cart-item": key,
        "aria-label": `${colorLabel(item.color)} ${item.size} quantity`
      }),
      h("span", {
        class: "cart-amount",
        text: Tally.formatPesos(item.qty * Tally.priceFor(item.size))
      }),
      h("button", {
        type: "button",
        class: "cart-remove",
        "data-cart-remove": key,
        "aria-label": `Remove ${colorLabel(item.color)} ${item.size} from the cart`,
        title: "Remove",
        text: "×"
      })
    );
  }));

  const name = Tally.cleanName(nameInput.value);
  document.getElementById("cart-hint").textContent = items.length
    ? `Press ADD TO LIST to put ${Tally.isValidName(name) ? name : "this name"} on the people list.`
    : "The cart is not saved until you press ADD TO LIST.";
}

function onCartChange(event) {
  const key = event.target.dataset && event.target.dataset.cartItem;
  if (!key) return;
  const [color, size] = key.split("|");
  cart = Tally.setCellQty(cart, color, size, event.target.value);
  renderCart();
}

function onCartClick(event) {
  const button = event.target.closest("[data-cart-remove]");
  if (!button) return;
  const [color, size] = button.dataset.cartRemove.split("|");
  cart = Tally.setCellQty(cart, color, size, 0);
  renderCart();
  announce(`${colorLabel(color)} ${size} removed from the cart.`);
}

function updateDupHint(name) {
  const hint = document.getElementById("dup-hint");
  const matches = name
    ? people.filter((person) => person.name.toLowerCase() === name.toLowerCase())
    : [];
  if (!matches.length) {
    hint.hidden = true;
    hint.textContent = "";
    return;
  }
  const detail = matches.map((person) => Tally.describePerson(person)).join("; ");
  hint.hidden = false;
  hint.textContent = matches.length === 1
    ? `Already on the list: ${detail}.`
    : `Already on the list ${matches.length} times: ${detail}.`;
}

/* ---------- list ---------- */

function isFiltered() {
  return query.trim() !== "" || filter !== "all";
}

function visiblePeople() {
  let list = people.slice();
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((person) => person.name.toLowerCase().includes(q));
  if (filter === "paid") list = list.filter((person) => person.paid);
  if (filter === "unpaid") list = list.filter((person) => !person.paid);
  if (filter === "white") list = list.filter((person) => hasColor(person, "white"));
  if (filter === "blue") list = list.filter((person) => hasColor(person, "blue"));

  const byTime = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
  if (sortMode === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || byTime(a, b));
  } else if (sortMode === "unpaid") {
    list.sort((a, b) => Number(a.paid) - Number(b.paid) || byTime(a, b));
  }
  return list;
}

function entryNumber(person) {
  return people.findIndex((item) => item.id === person.id) + 1;
}

/*
 * The column widths. A <colgroup> plus table-layout:fixed in the CSS is what
 * keeps every row lined up: the name is always column one, in the header, in
 * every person row and in the footer. With the automatic table layout the
 * browser would guess the widths from the cell content and the name column
 * would drift into the size grid.
 */
function buildCols() {
  const col = (cls) => h("col", { class: cls });
  const sizeCols = () => Tally.SIZES.map(() => col("col-size"));
  document.getElementById("order-cols").replaceChildren(
    col("col-name"),
    col("col-summary"),
    ...sizeCols(),
    ...sizeCols(),
    col("col-price"),
    col("col-status"),
    col("col-actions")
  );
}

function buildHead() {
  const sizeCells = (color) => Tally.SIZES.map((size) => h("th", {
    scope: "col",
    class: `cell-qty sz-${color}`,
    "data-size": size
  },
    h("span", { class: "sz-name", text: size }),
    h("span", { class: "sz-price", text: Tally.formatPesos(Tally.priceFor(size)) })
  ));

  document.getElementById("order-head").replaceChildren(
    h("tr", {},
      h("th", { rowspan: "2", scope: "col", class: "col-name", text: "NAME" }),
      h("th", { colspan: String(Tally.SIZES.length), scope: "colgroup", class: "color-group group-white", text: "WHITE" }),
      h("th", { colspan: String(Tally.SIZES.length), scope: "colgroup", class: "color-group group-blue", text: "BLUE" }),
      h("th", { rowspan: "2", scope: "col", class: "col-price", text: "PRICE" }),
      h("th", { rowspan: "2", scope: "col", class: "col-status", text: "PAID/UNPAID" }),
      h("th", { rowspan: "2", scope: "col", class: "col-actions" }, h("span", { class: "sr-only", text: "Actions" }))
    ),
    h("tr", {}, ...sizeCells("white"), ...sizeCells("blue"))
  );
}

/*
 * One cell of the size grid. Read only until EDIT is pressed on the row,
 * which is the only time a quantity can be changed.
 */
function qtyCell(person, color, size, value, editing) {
  const key = `${color}|${size}`;
  const cell = h("td", {
    class: `cell-qty sz-${color}${value ? "" : " is-zero"}`,
    "data-label": size,
    "data-cell": key
  });

  if (editing) {
    cell.append(h("input", {
      class: "qty-input",
      type: "number",
      min: "0",
      max: String(Tally.MAX_QTY),
      step: "1",
      inputmode: "numeric",
      value: String(value || 0),
      "data-cell-input": key,
      "aria-label": `${colorLabel(color)} ${size} quantity for ${person.name}`
    }));
  } else {
    cell.append(h("span", { class: "qty-figure", text: value ? String(value) : "" }));
  }
  return cell;
}

/* Extra phone detail only: main's caret still controls the expanded grid. */
function summaryCell(grid) {
  const wrap = h("div", { class: "sum-wrap" });
  Tally.COLORS.forEach((color) => {
    Tally.SIZES.forEach((size) => {
      const qty = grid[color][size];
      if (qty) wrap.append(h("span", { class: `sum-chip is-${color}` },
        h("span", { class: "sum-color", text: colorLabel(color) }),
        h("span", { class: "sum-size", text: size }),
        h("span", { class: "sum-qty", text: "\u00d7" + qty })));
    });
  });
  if (!wrap.childNodes.length) wrap.append(h("span", { class: "sum-empty", text: "no shirts yet" }));
  return h("td", { class: "col-summary", "data-label": "SIZES" }, wrap);
}

function renderRow(person) {
  const editing = editingId === person.id;
  const grid = Tally.personGrid(person);
  const row = h("tr", {
    "data-id": person.id,
    class: `${person.paid ? "is-paid" : "is-unpaid"}${editing ? " is-editing" : ""}${expandedIds.has(person.id) ? " is-open" : ""}${person.id === highlightId ? " is-new" : ""}`
  });

  const nameCell = h("th", { scope: "row", class: "col-name", "data-label": "NAME" });
  /* Phone only (hidden on the desktop sheet): taps open the size grid for this person. */
  const expandBtn = h("button", {
    type: "button",
    class: "expand-btn no-print",
    "data-action": "expand",
    "aria-expanded": expandedIds.has(person.id) ? "true" : "false",
    "aria-label": `Show the size grid for ${person.name}`,
    text: "▸"
  });
  const nameWrap = h("div", { class: "name-wrap" },
    expandBtn,
    h("span", { class: "num", text: String(entryNumber(person)).padStart(3, "0") })
  );
  if (editing) {
    nameWrap.append(h("input", {
      class: "name-input",
      type: "text",
      maxlength: "80",
      value: person.name,
      "data-field": "name",
      "aria-label": "Name",
      autocapitalize: "words",
      autocomplete: "off",
      spellcheck: "false"
    }));
  } else {
    nameWrap.append(h("span", { class: "name-text", text: person.name }));
  }
  nameCell.append(nameWrap);
  /* The name is the first column, so it has to be in the row before the grid. */
  row.append(nameCell);
  row.append(summaryCell(grid));

  Tally.COLORS.forEach((color) => {
    Tally.SIZES.forEach((size) => row.append(qtyCell(person, color, size, grid[color][size], editing)));
  });

  const status = h("td", { class: "col-status", "data-label": "PAID/UNPAID" });
  status.append(h("button", {
    type: "button",
    class: `pay-pill ${person.paid ? "is-paid" : "is-unpaid"}`,
    "data-action": "toggle",
    "aria-pressed": person.paid ? "true" : "false",
    "aria-label": `${person.paid ? "Mark unpaid" : "Mark paid"}: ${person.name}`,
    text: person.paid ? "PAID" : "UNPAID"
  }));

  const actions = h("td", { class: "col-actions no-print", "data-label": "EDIT" });
  actions.append(
    h("button", {
      type: "button",
      class: `edit-btn${editing ? " is-done" : ""}`,
      "data-action": "edit",
      "aria-pressed": editing ? "true" : "false",
      "aria-label": editing ? `Finish editing ${person.name}` : `Edit the quantities for ${person.name}`,
      text: editing ? "DONE" : "EDIT"
    }),
    h("button", {
      type: "button",
      class: "remove-btn",
      "data-action": "remove",
      "aria-label": `Remove ${person.name}`,
      title: "Remove",
      text: "×"
    })
  );

  row.append(
    h("td", { class: "col-price", "data-label": "PRICE" },
      h("span", { class: "price-figure", text: Tally.formatPesos(Tally.personPrice(person)) })),
    status,
    actions
  );
  return row;
}

/*
 * Phone layout only: each person shows as one row until the caret opens the
 * fourteen size cells. The class flips in place so taps stay snappy.
 */
function toggleExpand(id) {
  const open = !expandedIds.has(id);
  if (open) expandedIds.add(id); else expandedIds.delete(id);
  const row = tbody.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;
  row.classList.toggle("is-open", open);
  const button = row.querySelector(".expand-btn");
  if (button) {
    const person = findPerson(id);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", `${open ? "Hide" : "Show"} the size grid for ${person ? person.name : "this person"}`);
  }
}

/* Keep the caret where it was when a row redraws after an edit. */
function captureFocus() {
  const active = document.activeElement;
  if (!active || !active.dataset) return null;
  const cell = active.dataset.cellInput;
  const field = active.dataset.field;
  if (!cell && !field) return null;
  return {
    cell,
    field,
    rowId: active.closest("tr") ? active.closest("tr").dataset.id : null
  };
}

function restoreFocus(mark) {
  if (!mark || !mark.rowId) return;
  const row = tbody.querySelector(`tr[data-id="${mark.rowId}"]`);
  if (!row) return;
  const target = mark.cell
    ? row.querySelector(`[data-cell-input="${mark.cell}"]`)
    : row.querySelector(`[data-field="${mark.field}"]`);
  if (!target) return;
  target.focus();
  if (typeof target.select === "function") {
    try { target.select(); } catch (error) { /* not every input can select */ }
  }
}

function renderTable() {
  const mark = captureFocus();
  const shown = visiblePeople();
  document.getElementById("empty-state").hidden = people.length !== 0;
  document.getElementById("no-match").hidden = people.length === 0 || shown.length !== 0;
  document.getElementById("sheet").hidden = shown.length === 0;
  tbody.replaceChildren(...shown.map(renderRow));
  highlightId = null;
  restoreFocus(mark);
}

function footCell(color, size, value) {
  return h("td", { class: `cell-qty sz-${color}${value ? "" : " is-zero"}`, "data-label": size, text: String(value) });
}

function renderFoot(shown, full) {
  const foot = document.getElementById("order-foot");
  const summary = Tally.summarize(shown);
  const filtered = isFiltered();
  const name = h("th", { scope: "row", class: "col-name", "data-label": "NAME" });
  name.append(
    h("span", { class: "foot-label", text: filtered ? "SHOWN" : "TOTAL" }),
    h("span", { class: "foot-count", text: `${Tally.peopleLabel(summary.count)} · ${Tally.shirtsLabel(summary.shirts)}` })
  );
  if (filtered) {
    name.append(h("span", { class: "foot-note", text: `Full list total ${Tally.formatPesos(full.total)} is below` }));
  }

  const status = h("td", { class: "col-status", "data-label": "PAID/UNPAID" });
  status.append(
    document.createTextNode(`${summary.paidCount} paid`),
    h("span", { class: "foot-note", text: `${summary.unpaidCount} unpaid` })
  );

  const cells = Tally.COLORS.flatMap((color) =>
    Tally.SIZES.map((size) => footCell(color, size, summary.grid[color][size])));

  foot.replaceChildren(h("tr", {},
    name,
    h("td", { class: "col-summary", "data-label": "SIZES" }),
    ...cells,
    h("td", { class: "col-price", "data-label": "PRICE" }, h("span", { class: "total-figure", text: Tally.formatPesos(summary.total) })),
    status,
    h("td", { class: "col-actions no-print", "data-label": "" })
  ));
}

function countCell(count) {
  return h("td", { class: count ? "" : "is-zero", text: String(count) });
}

function renderMatrix(summary) {
  const table = document.getElementById("matrix");
  const head = h("thead", {}, h("tr", {},
    h("th", { class: "row-label", scope: "col", text: "T-SHIRT COLOR" }),
    ...Tally.SIZES.map((size) => h("th", { scope: "col" },
      h("span", { class: "mx-size", text: size }),
      h("span", { class: "mx-price", text: Tally.formatPesos(Tally.priceFor(size)) })
    )),
    h("th", { scope: "col", text: "SHIRTS" }),
    h("th", { scope: "col", text: "AMOUNT" })
  ));

  function row(label, color) {
    const count = color ? summary.colorCount[color] : summary.shirts;
    const amount = color ? summary.colorAmount[color] : summary.total;
    const cells = Tally.SIZES.map((size) => countCell(color ? summary.grid[color][size] : summary.sizeCount[size]));
    return h("tr", { class: color ? `${color}-row` : "total-row" },
      h("td", { class: "row-label", text: label }),
      ...cells,
      h("td", { class: "shirts", text: String(count) }),
      h("td", { class: "amount", text: Tally.formatPesos(amount) })
    );
  }

  table.replaceChildren(head, h("tbody", {},
    row("WHITE", "white"),
    row("BLUE", "blue"),
    row("TOTAL", null)
  ));
}

function renderSummary(summary) {
  document.getElementById("sum-total").textContent = Tally.formatPesos(summary.total);
  document.getElementById("sum-shirts").textContent = String(summary.shirts);
  document.getElementById("sum-paid").textContent = Tally.formatPesos(summary.paid);
  document.getElementById("sum-unpaid").textContent = Tally.formatPesos(summary.unpaid);
  document.getElementById("sum-people").textContent = Tally.peopleLabel(summary.count);
  document.getElementById("sum-paid-count").textContent = `${summary.paidCount} paid`;
  document.getElementById("sum-unpaid-count").textContent = `${summary.unpaidCount} unpaid`;
  document.getElementById("updated-at").textContent = isFiltered()
    ? "This total is the full list, not just the rows shown above."
    : people.length
      ? `Full list · updated ${stamp()}`
      : "Full list · no one added yet";
  document.getElementById("price-note").textContent =
    `S, M, L, and XL are ${Tally.formatPesos(Tally.PRICES.S)} each. 2XL, 3XL, and 4XL are ${Tally.formatPesos(Tally.PRICES["2XL"])} each.`;
  renderMatrix(summary);

  const empty = people.length === 0;
  document.getElementById("copy-summary").disabled = empty;
  document.getElementById("copy-unpaid").disabled = empty;
  document.getElementById("export-csv").disabled = empty;
  document.getElementById("backup-btn").disabled = empty;
  document.getElementById("clear-btn").disabled = empty;
}

function barStat(label, value, className) {
  return h("p", { class: className ? `bar-stat ${className}` : "bar-stat" },
    h("span", { text: label }),
    h("strong", { text: value })
  );
}

function renderTotalBar(summary) {
  const bar = document.getElementById("total-bar");
  bar.replaceChildren(
    h("div", { class: "bar-counts" },
      barStat("PEOPLE", String(summary.count)),
      barStat("SHIRTS", String(summary.shirts))
    ),
    h("div", { class: "bar-money" },
      barStat("PAID", Tally.formatPesos(summary.paid), "paid"),
      barStat("UNPAID", Tally.formatPesos(summary.unpaid), "unpaid"),
      barStat("TOTAL", Tally.formatPesos(summary.total), "total")
    )
  );
  if (lastTotal != null && lastTotal !== summary.total) {
    bar.classList.remove("pulse");
    void bar.offsetWidth;
    bar.classList.add("pulse");
  }
  lastTotal = summary.total;
}

function renderMeta(summary) {
  document.getElementById("head-people").textContent = String(summary.count);
  document.getElementById("head-shirts").textContent = String(summary.shirts);

  const full = people.length >= Tally.MAX_PEOPLE;
  const left = Tally.MAX_PEOPLE - people.length;
  document.getElementById("spots-left").textContent = full
    ? "Up to 300 people — list is full"
    : `Up to 300 people · ${left} ${left === 1 ? "spot" : "spots"} left`;
  document.getElementById("full-banner").hidden = !full;
  document.getElementById("cart-add").disabled = full;
  document.getElementById("add-person-btn").disabled = full;
  document.getElementById("add-person-btn").textContent = full ? "List is full" : "ADD TO LIST";

  const shown = visiblePeople();
  document.getElementById("result-count").textContent = isFiltered()
    ? `Showing ${Tally.peopleLabel(shown.length)} of ${people.length}`
    : (people.length ? Tally.peopleLabel(people.length) : "No one yet");

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.filter === filter ? "true" : "false");
  });

  document.title = people.length
    ? `(${Tally.formatPesos(summary.total)}) TEAM ELITE PH TSHIRT`
    : "TEAM ELITE PH TSHIRT";
}

function renderTotals() {
  const summary = Tally.summarize(people);
  const shown = visiblePeople();
  renderMeta(summary);
  renderFoot(shown, summary);
  renderSummary(summary);
  renderTotalBar(summary);
}

function showOpenFile() {
  if (!DOC) return;
  const name = document.getElementById("open-file-name");
  const when = document.getElementById("open-file-when");
  const title = document.getElementById("step3-title");
  if (name) name.textContent = DOC.name;
  if (when) when.textContent = `Last modified ${Store.formatDate(DOC.updatedAt)}`;
  if (title) title.textContent = DOC.name;
}

function render(options = {}) {
  showOpenFile();
  const keepScroll = options.keepScroll !== false;
  const scrollY = window.scrollY;
  renderTable();
  renderTotals();
  if (keepScroll && typeof window.scrollTo === "function") {
    window.scrollTo(0, scrollY);
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
  }
}

/* ---------- row actions ---------- */

function togglePaid(id) {
  const person = findPerson(id);
  if (!person) return;
  person.paid = !person.paid;
  savePeople();
  render();
  const summary = Tally.summarize(people);
  announce(`${person.name} marked ${person.paid ? "paid" : "unpaid"}. Unpaid ${Tally.formatPesos(summary.unpaid)}. Total ${Tally.formatPesos(summary.total)}.`);
}

function toggleEdit(id) {
  if (editingId === id) {
    editingId = null;
    savePeople();
    render();
    announce("Finished editing. Quantities are read only again.");
    return;
  }
  editingId = id;
  /* The size cells must be visible to edit them, so the row opens on phones. */
  expandedIds.add(id);
  render();
  const person = findPerson(id);
  if (person) {
    announce(`Editing ${person.name}. Change any quantity, then press DONE.`);
    const first = tbody.querySelector(`tr[data-id="${id}"] [data-cell-input]`);
    if (first) first.focus();
  }
}

function removePerson(id) {
  const index = people.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [removed] = people.splice(index, 1);
  if (editingId === id) editingId = null;
  expandedIds.delete(id);
  savePeople();
  render();
  announce(`Removed ${removed.name}.`);
  showToast(`Removed ${removed.name}.`, "Undo", () => {
    people.splice(Math.min(index, people.length), 0, removed);
    savePeople();
    render();
    announce(`${removed.name} is back on the list.`);
  });
}

function onRowInput(event) {
  const field = event.target.dataset && event.target.dataset.field;
  if (field === "name") {
    const row = event.target.closest("tr");
    const person = row && findPerson(row.dataset.id);
    if (!person) return;
    person.name = String(event.target.value || "").slice(0, 80);
    scheduleSave();
  }
}

function onRowChange(event) {
  const el = event.target;
  const data = el.dataset || {};
  const row = el.closest("tr");
  const person = row && findPerson(row.dataset.id);
  if (!person) return;

  if (data.cellInput) {
    const [color, size] = data.cellInput.split("|");
    person.items = Tally.setCellQty(person.items, color, size, el.value);
    savePeople();
    render();
    const before = Tally.personShirts(person);
    announce(`${person.name}: ${colorLabel(color)} ${size} set to ${Tally.cellQty(person.items, color, size)}. ${Tally.shirtsLabel(before)} for ${person.name}.`);
    return;
  }

  if (data.field === "name") {
    const cleaned = Tally.cleanName(el.value);
    if (Tally.isValidName(cleaned)) {
      person.name = cleaned;
      el.value = cleaned;
    } else {
      el.value = person.name;
      showToast("A name is needed for every row.");
    }
    savePeople();
    render();
  }
}

/* ---------- modals ---------- */

function focusable(modal) {
  return [...modal.querySelectorAll("button, input, select, textarea")].filter((el) => {
    return !el.disabled && el.type !== "hidden" && !el.closest("[hidden]");
  });
}

function openModal(modal) {
  modalReturnFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  modal.hidden = true;
  if (!document.querySelector(".modal:not([hidden])")) document.body.classList.remove("modal-open");
  if (modalReturnFocus && typeof modalReturnFocus.focus === "function") modalReturnFocus.focus();
}

function trapTab(event, modal) {
  if (event.key !== "Tab" || modal.hidden) return;
  const items = focusable(modal);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openConfirm(options) {
  const modal = document.getElementById("confirm-modal");
  document.getElementById("confirm-title").textContent = options.title;
  document.getElementById("confirm-body").textContent = options.body;
  const ok = document.getElementById("confirm-ok");
  ok.textContent = options.confirmLabel || "Confirm";
  ok.className = options.danger ? "danger-btn" : "primary-btn";
  const extra = document.getElementById("confirm-extra");
  extra.hidden = !options.extraLabel;
  extra.textContent = options.extraLabel || "";
  confirmHandler = options.onConfirm || null;
  extraHandler = options.onExtra || null;
  openModal(modal);
  document.getElementById("confirm-cancel").focus();
}

function closeConfirm() {
  confirmHandler = null;
  extraHandler = null;
  closeModal(document.getElementById("confirm-modal"));
}

/* ---------- export / backup ---------- */

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sizeHeaders() {
  return Tally.COLORS.flatMap((color) =>
    Tally.SIZES.map((size) => `${colorLabel(color)} ${size}`));
}

function buildCsv() {
  const summary = Tally.summarize(people);
  const header = ["#", "Name", ...sizeHeaders(), "Shirts", "Price", "Status"];

  const rows = people.map((person, index) => {
    const grid = Tally.personGrid(person);
    return [
      index + 1,
      person.name,
      ...Tally.COLORS.flatMap((color) => Tally.SIZES.map((size) => grid[color][size])),
      Tally.personShirts(person),
      Tally.personPrice(person),
      person.paid ? "Paid" : "Unpaid"
    ];
  });

  rows.push([]);
  rows.push(["SUMMARY"]);
  rows.push(["Color", ...Tally.SIZES, "Shirts", "Amount"]);
  rows.push(["White", ...Tally.SIZES.map((size) => summary.grid.white[size]), summary.colorCount.white, summary.colorAmount.white]);
  rows.push(["Blue", ...Tally.SIZES.map((size) => summary.grid.blue[size]), summary.colorCount.blue, summary.colorAmount.blue]);
  rows.push(["Total", ...Tally.SIZES.map((size) => summary.sizeCount[size]), summary.shirts, summary.total]);
  rows.push([]);
  rows.push(["People", summary.count]);
  rows.push(["Shirts", summary.shirts]);
  rows.push(["Paid", summary.paid]);
  rows.push(["Unpaid", summary.unpaid]);
  rows.push(["Total", summary.total]);

  const all = [header, ...rows];
  return `\uFEFF${all.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
}

function downloadBackup() {
  const safe = (DOC ? DOC.name : "list").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const payload = {
    app: "TEAM ELITE PH TSHIRT",
    version: 3,
    exportedAt: new Date().toISOString(),
    file: DOC ? DOC.name : "",
    people
  };
  download(
    `team-elite-${safe}-${fileDate()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}

function exportCsv() {
  if (!people.length) return;
  download(`team-elite-ph-tshirt-${fileDate()}.csv`, buildCsv(), "text/csv;charset=utf-8");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = h("textarea", { readonly: "readonly" });
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (copyError) { ok = false; }
    area.remove();
    return ok;
  }
}

function summaryText() {
  const summary = Tally.summarize(people);
  const line = (color) => Tally.SIZES.map((size) => `${size} ${summary.grid[color][size]}`).join("  ");
  return [
    "TEAM ELITE PH TSHIRT",
    `${Tally.peopleLabel(summary.count)} · ${Tally.shirtsLabel(summary.shirts)}`,
    `White — ${line("white")}`,
    `Blue — ${line("blue")}`,
    `Total: ${Tally.formatPesos(summary.total)}`,
    `Paid: ${Tally.formatPesos(summary.paid)} (${summary.paidCount} people)`,
    `Unpaid: ${Tally.formatPesos(summary.unpaid)} (${summary.unpaidCount} people)`
  ].join("\n");
}

function unpaidText() {
  const unpaid = people.filter((person) => !person.paid);
  const summary = Tally.summarize(people);
  if (!unpaid.length) return "TEAM ELITE PH TSHIRT\nEveryone is paid.";
  return [
    "UNPAID — TEAM ELITE PH TSHIRT",
    ...unpaid.map((person, index) => `${index + 1}. ${person.name} — ${Tally.describePerson(person)} — ${Tally.formatPesos(Tally.personPrice(person))}`),
    `Unpaid total: ${Tally.formatPesos(summary.unpaid)}`
  ].join("\n");
}

function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("That file is not a readable backup.");
  }
  const arr = Array.isArray(data)
    ? data
    : data && Array.isArray(data.people)
      ? data.people
      : data && Array.isArray(data.orders)
        ? data.orders
        : null;
  if (!arr) throw new Error("This file is not a Team Elite shirt backup.");

  const restored = [];
  let skipped = 0;
  arr.forEach((item) => {
    const legacy = item && item.size != null && item.color != null && !item.items && !item.white && !item.blue;
    const person = legacy ? Tally.migrateLegacyOrder(item, uid) : Tally.normalizePerson(item, uid);
    if (person) restored.push(person);
    else skipped += 1;
  });
  if (restored.length > Tally.MAX_PEOPLE) {
    throw new Error(`That backup has ${restored.length} people. This list holds 300.`);
  }
  if (!restored.length) throw new Error("No usable people were found in that backup.");
  return { people: restored, skipped };
}

function applyRestore(restored, skipped) {
  const go = () => {
    people = restored;
    editingId = null;
    savePeople();
    render();
    showToast(skipped
      ? `Restored ${Tally.peopleLabel(people.length)}. ${skipped} ${skipped === 1 ? "row was" : "rows were"} skipped.`
      : `Restored ${Tally.peopleLabel(people.length)}.`);
  };
  if (!people.length) {
    go();
    return;
  }
  openConfirm({
    title: "Replace the current list?",
    body: `This device already has ${Tally.peopleLabel(people.length)}. Replacing it cannot be undone unless you downloaded a backup.`,
    confirmLabel: "Replace list",
    danger: true,
    extraLabel: "Download backup first",
    onExtra: downloadBackup,
    onConfirm: go
  });
}

function clearFilters() {
  filter = "all";
  query = "";
  searchInput.value = "";
  render();
}

function beforePrint() {
  printSnapshot = { filter, sortMode, query, search: searchInput.value };
  filter = "all";
  sortMode = "entry";
  query = "";
  searchInput.value = "";
  sortEl.value = "entry";
  document.getElementById("print-stamp").textContent = `Full list · printed ${stamp()}`;
  render();
}

function afterPrint() {
  if (!printSnapshot) return;
  ({ filter, sortMode, query } = printSnapshot);
  searchInput.value = printSnapshot.search;
  sortEl.value = sortMode;
  printSnapshot = null;
  render();
}

function fillPrices() {
  document.getElementById("price-legend").textContent = Tally.priceLegend();
  const tag = document.getElementById("build-tag");
  if (tag) {
    tag.textContent = `build ${BUILD} · ${new Date().toLocaleString("en-PH")}`;
    document.body.dataset.build = BUILD;
  }
}

/* ---------- wiring ---------- */

function bind() {
  addForm.addEventListener("submit", addToCart);
  addForm.addEventListener("input", () => {
    delete addForm.dataset.confirmDup;
    setFormError("form-error", "");
    updateDupHint(Tally.cleanName(nameInput.value));
    renderCart();
  });

  document.getElementById("add-person-btn").addEventListener("click", addPersonToList);
  document.getElementById("cart-clear").addEventListener("click", clearCart);
  document.getElementById("cart-list").addEventListener("change", onCartChange);
  document.getElementById("cart-list").addEventListener("click", onCartClick);

  tbody.addEventListener("input", onRowInput);
  tbody.addEventListener("change", onRowChange);
  tbody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.closest("tr")?.dataset.id;
    if (!id) return;
    if (button.dataset.action === "toggle") togglePaid(id);
    if (button.dataset.action === "edit") toggleEdit(id);
    if (button.dataset.action === "remove") removePerson(id);
    if (button.dataset.action === "expand") toggleExpand(id);
  });

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    render();
  });

  document.querySelector(".filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    render();
  });

  sortEl.addEventListener("change", () => {
    sortMode = sortEl.value;
    render();
  });
  document.getElementById("clear-filters").addEventListener("click", clearFilters);

  document.getElementById("save-btn").addEventListener("click", saveNow);
  document.getElementById("update-list-btn").addEventListener("click", updateList);
  document.getElementById("export-csv").addEventListener("click", exportCsv);
  document.getElementById("print-btn").addEventListener("click", () => window.print());
  document.getElementById("backup-btn").addEventListener("click", downloadBackup);
  document.getElementById("restore-btn").addEventListener("click", () => document.getElementById("restore-file").click());
  document.getElementById("recover-btn").addEventListener("click", () => document.getElementById("restore-file").click());
  document.getElementById("restore-file").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      applyRestore(parsed.people, parsed.skipped);
    } catch (error) {
      showToast(error.message || "Could not restore that file.");
    }
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    if (!people.length) return;
    openConfirm({
      title: "Erase the whole list?",
      body: `This removes ${Tally.peopleLabel(people.length)} from this website. Download a backup first if you still need the names.`,
      confirmLabel: "Erase list",
      danger: true,
      extraLabel: "Download backup",
      onExtra: downloadBackup,
      onConfirm: () => {
        const snapshot = people.slice();
        people = [];
        editingId = null;
        savePeople();
        render();
        showToast("List cleared.", "Undo", () => {
          people = snapshot;
          savePeople();
          render();
        });
      }
    });
  });

  document.getElementById("copy-summary").addEventListener("click", async () => {
    const ok = await copyText(summaryText());
    showToast(ok ? "Summary copied." : "Could not copy. Use Export CSV instead.");
  });
  document.getElementById("copy-unpaid").addEventListener("click", async () => {
    const ok = await copyText(unpaidText());
    showToast(ok ? "Unpaid list copied." : "Could not copy. Use Export CSV instead.");
  });

  document.getElementById("confirm-cancel").addEventListener("click", closeConfirm);
  document.getElementById("confirm-ok").addEventListener("click", () => {
    const handler = confirmHandler;
    closeConfirm();
    if (handler) handler();
  });
  document.getElementById("confirm-extra").addEventListener("click", () => {
    if (extraHandler) extraHandler();
  });

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.close === "confirm") closeConfirm();
    });
  });

  document.addEventListener("keydown", (event) => {
    const modal = document.getElementById("confirm-modal");
    if (event.key === "Escape") {
      if (!modal.hidden) {
        closeConfirm();
      } else if (editingId) {
        const person = findPerson(editingId);
        editingId = null;
        render();
        announce(`Finished editing ${person ? person.name : "the row"}.`);
      }
      return;
    }
    if (!modal.hidden) trapTab(event, modal);
  });

  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);

  /*
   * Phones and browsers kill background tabs without warning, and a pending
   * keystroke would be the only thing lost. Flush on the way out.
   */
  window.addEventListener("pagehide", flushPendingSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSave();
  });

  const viewport = window.visualViewport;
  if (viewport) {
    const syncKeyboard = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 140;
      document.body.classList.toggle("typing", keyboardOpen);
    };
    viewport.addEventListener("resize", syncKeyboard);
    viewport.addEventListener("scroll", syncKeyboard);
  }
}

function init() {
  if (!Tally) {
    setFormError("form-error", "The price list did not load. Refresh the page.");
    return;
  }
  fillPrices();
  fillSizeOptions();
  buildCols();
  buildHead();
  people = loadPeople();
  bind();
  render();
  renderCart();
  checkStorageLoss();
  if (pendingNotice) showToast(pendingNotice);
  if (!window.matchMedia || !window.matchMedia("(max-width: 800px)").matches) {
    nameInput.focus();
  }
}

init();
