"use strict";

const Tally = window.Tally;
const STORAGE_KEY = "team-elite-ph-tshirt-people-v2";
const LEGACY_KEY = "team-elite-ph-tshirt-orders-v1";

const addForm = document.getElementById("add-form");
const nameInput = document.getElementById("name-input");
const searchInput = document.getElementById("search");
const sortEl = document.getElementById("sort-orders");
const toastEl = document.getElementById("toast");
const liveEl = document.getElementById("live");
const tbody = document.getElementById("order-body");

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

function setRadio(form, name, value) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = input.value === value;
  });
}

function findPerson(id) {
  return people.find((person) => person.id === id) || null;
}

function describePerson(person) {
  const parts = [];
  if (Tally.hasColorOrder(person.white)) parts.push(`white ${person.white.size} ×${person.white.qty}`);
  if (Tally.hasColorOrder(person.blue)) parts.push(`blue ${person.blue.size} ×${person.blue.qty}`);
  if (person.xl3) parts.push(`3XL ×${person.xl3}`);
  if (person.xl4) parts.push(`4XL ×${person.xl4}`);
  return parts.join(" · ") || "no shirts yet";
}

/* ---------- storage ---------- */

function loadPeople() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : [];
      const restored = [];
      let skipped = 0;
      arr.forEach((item) => {
        const person = Tally.normalizePerson(item, uid);
        if (person) restored.push(person);
        else skipped += 1;
      });
      if (skipped) pendingNotice = "Some saved rows were skipped because they were incomplete.";
      return restored.slice(0, Tally.MAX_PEOPLE);
    }

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const data = JSON.parse(legacyRaw);
      const arr = Array.isArray(data) ? data : [];
      const restored = [];
      arr.forEach((item) => {
        const person = Tally.migrateLegacyOrder(item, uid);
        if (person) restored.push(person);
      });
      if (restored.length) {
        pendingNotice = "Your older shirt list was moved to the new one-person-per-row layout.";
        return restored.slice(0, Tally.MAX_PEOPLE);
      }
    }
    return [];
  } catch (error) {
    pendingNotice = "Could not read the saved list. Starting fresh on this device.";
    return [];
  }
}

function savePeople() {
  const state = document.getElementById("save-state");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
    state.classList.remove("is-error");
    state.textContent = `List saved on this website · ${stamp()}`;
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

function saveNow() {
  window.clearTimeout(saveTimer);
  const ok = savePeople();
  if (ok) {
    showToast("List saved on this website.");
    announce(`List saved. ${Tally.peopleLabel(people.length)} on the list.`);
  } else {
    showToast("Could not save on this device. Export a backup before you leave.");
  }
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
  if (filter === "white") list = list.filter((person) => Tally.hasColorOrder(person.white));
  if (filter === "blue") list = list.filter((person) => Tally.hasColorOrder(person.blue));

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

function buildSizeSelect(person, color) {
  const select = h("select", {
    class: "size-select",
    "data-field": `${color}-size`,
    "aria-label": `${colorLabel(color)} size`
  });
  select.append(h("option", { value: "", text: "—" }));
  Tally.SIZES.forEach((size) => select.append(h("option", { value: size, text: size })));
  select.value = person[color].size;
  return select;
}

function splitColorField(person, field) {
  const color = field.startsWith("white") ? "white" : "blue";
  return person[color].qty;
}

function colorCell(person, color) {
  const cell = h("td", { class: `col-${color}`, "data-label": colorLabel(color, true) });
  const wrap = h("div", { class: "cell-order" });
  const select = buildSizeSelect(person, color);
  const qty = h("input", {
    class: "qty-input",
    type: "number",
    min: "0",
    max: String(Tally.MAX_QTY),
    inputmode: "numeric",
    "data-field": `${color}-qty`,
    "aria-label": `${colorLabel(color)} quantity`
  });
  qty.value = String(person[color].qty);
  qty.disabled = !person[color].size;
  wrap.append(select, qty);
  cell.append(wrap);
  return cell;
}

function extraCell(person, field, label) {
  const cell = h("td", { class: `col-${field}`, "data-label": label });
  const qty = h("input", {
    class: "qty-input",
    type: "number",
    min: "0",
    max: String(Tally.MAX_QTY),
    inputmode: "numeric",
    "data-field": field,
    "aria-label": `Extra ${label} quantity`
  });
  qty.value = String(person[field]);
  cell.append(qty);
  return cell;
}

function renderRow(person) {
  const row = h("tr", {
    "data-id": person.id,
    class: `${person.paid ? "is-paid" : "is-unpaid"}${person.id === highlightId ? " is-new" : ""}`
  });

  const nameCell = h("th", { scope: "row", class: "col-name", "data-label": "NAME" });
  nameCell.append(h("div", { class: "name-wrap" },
    h("span", { class: "num", text: String(entryNumber(person)).padStart(3, "0") }),
    h("input", {
      class: "name-input",
      type: "text",
      maxlength: "80",
      value: person.name,
      "data-field": "name",
      "aria-label": "Name",
      autocapitalize: "words",
      autocomplete: "off",
      spellcheck: "false"
    })
  ));

  const status = h("td", { class: "col-status", "data-label": "PAID/UNPAID" });
  status.append(h("button", {
    type: "button",
    class: `pay-pill ${person.paid ? "is-paid" : "is-unpaid"}`,
    "data-action": "toggle",
    "aria-pressed": person.paid ? "true" : "false",
    "aria-label": `${person.paid ? "Mark unpaid" : "Mark paid"}: ${person.name}`,
    text: person.paid ? "PAID" : "UNPAID"
  }));

  const actions = h("td", { class: "col-actions no-print", "data-label": "Actions" });
  actions.append(h("button", {
    type: "button",
    class: "remove-btn",
    "data-action": "remove",
    "aria-label": `Remove ${person.name}`,
    title: "Remove",
    text: "×"
  }));

  row.append(
    nameCell,
    colorCell(person, "white"),
    colorCell(person, "blue"),
    extraCell(person, "xl3", "3XL"),
    extraCell(person, "xl4", "4XL"),
    h("td", { class: "col-price", "data-label": "PRICE" },
      h("span", { class: "price-figure", text: Tally.formatPesos(Tally.personPrice(person)) })),
    status,
    actions
  );
  return row;
}

function updatePriceCell(row, person) {
  const figure = row.querySelector(".price-figure");
  if (figure) figure.textContent = Tally.formatPesos(Tally.personPrice(person));
}

function syncColorInputs(row, person, color) {
  const select = row.querySelector(`[data-field="${color}-size"]`);
  const qty = row.querySelector(`[data-field="${color}-qty"]`);
  if (select) select.value = person[color].size;
  if (qty) {
    qty.value = String(person[color].qty);
    qty.disabled = !person[color].size;
  }
}

function renderTable() {
  const shown = visiblePeople();
  document.getElementById("empty-state").hidden = people.length !== 0;
  document.getElementById("no-match").hidden = people.length === 0 || shown.length !== 0;
  document.getElementById("sheet").hidden = shown.length === 0;
  tbody.replaceChildren(...shown.map(renderRow));
  highlightId = null;
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

  foot.replaceChildren(h("tr", {},
    name,
    h("td", { class: "col-white", "data-label": "WHITE", text: String(summary.colorCount.white) }),
    h("td", { class: "col-blue", "data-label": "BLUE", text: String(summary.colorCount.blue) }),
    h("td", { class: "col-xl3", "data-label": "3XL", text: String(summary.extras["3XL"]) }),
    h("td", { class: "col-xl4", "data-label": "4XL", text: String(summary.extras["4XL"]) }),
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
      h("span", { class: "mx-price", text: Tally.formatPesos(Tally.PRICES[size]) })
    )),
    h("th", { scope: "col", text: "SHIRTS" }),
    h("th", { scope: "col", text: "AMOUNT" })
  ));

  function row(label, color) {
    const count = color === "extra"
      ? summary.colorCount.extra
      : color ? summary.colorCount[color] : summary.shirts;
    const amount = color === "extra"
      ? summary.colorAmount.extra
      : color ? summary.colorAmount[color] : summary.total;
    const cells = Tally.SIZES.map((size) => color === "extra"
      ? countCell(summary.extras[size])
      : color ? countCell(summary.grid[color][size]) : countCell(summary.sizeCount[size]));
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
    row("3XL/4XL EXTRA", "extra"),
    row("TOTAL", null)
  ));
}

function renderSummary(summary) {
  document.getElementById("sum-total").textContent = Tally.formatPesos(summary.total);
  document.getElementById("sum-paid").textContent = Tally.formatPesos(summary.paid);
  document.getElementById("sum-unpaid").textContent = Tally.formatPesos(summary.unpaid);
  document.getElementById("sum-people").textContent = `${Tally.peopleLabel(summary.count)} · ${Tally.shirtsLabel(summary.shirts)}`;
  document.getElementById("sum-paid-count").textContent = `${summary.paidCount} paid`;
  document.getElementById("sum-unpaid-count").textContent = `${summary.unpaidCount} unpaid`;
  document.getElementById("updated-at").textContent = isFiltered()
    ? "This total is the full list, not just the rows shown above."
    : people.length
      ? `Full list · updated ${stamp()}`
      : "Full list · no one added yet";
  document.getElementById("price-note").textContent =
    `S, M, L, and XL are ${Tally.formatPesos(Tally.PRICES.S)}. 2XL, 3XL, and 4XL are ${Tally.formatPesos(Tally.PRICES["2XL"])}. The 3XL and 4XL columns are extra shirts at ${Tally.formatPesos(Tally.PRICES["3XL"])} each.`;
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

  const left = Tally.MAX_PEOPLE - people.length;
  document.getElementById("spots-left").textContent = left === 0
    ? "Up to 300 people — list is full"
    : `Up to 300 people · ${left} ${left === 1 ? "spot" : "spots"} left`;
  document.getElementById("full-banner").hidden = left !== 0;
  document.getElementById("add-btn").disabled = left === 0;
  document.getElementById("add-btn").textContent = left === 0 ? "List is full" : "Add person";

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

function render(options = {}) {
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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el.textContent !== text) el.textContent = text;
}

function setFormError(id, message) {
  const el = document.getElementById(id);
  el.hidden = !message;
  el.textContent = message || "";
  if (message && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
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
  const detail = matches.map((person) => describePerson(person)).join("; ");
  hint.hidden = false;
  hint.textContent = matches.length === 1
    ? `Already on the list: ${detail}.`
    : `Already on the list ${matches.length} times: ${detail}.`;
}

/* ---------- actions ---------- */

function addPerson(event) {
  event.preventDefault();
  if (people.length >= Tally.MAX_PEOPLE) {
    setFormError("form-error", "The list is full at 300 people. Remove someone to add another.");
    return;
  }
  const name = Tally.cleanName(nameInput.value);
  if (!Tally.isValidName(name)) {
    setFormError("form-error", "Enter the person's name.");
    nameInput.focus();
    return;
  }

  const dup = people.some((person) => person.name.toLowerCase() === name.toLowerCase());
  if (dup && addForm.dataset.confirmDup !== "1") {
    addForm.dataset.confirmDup = "1";
    setFormError("form-error", `${name} is already on the list. Press Add anyway to add another person.`);
    return;
  }

  const person = {
    id: uid(),
    name,
    white: Tally.emptyColor(),
    blue: Tally.emptyColor(),
    xl3: 0,
    xl4: 0,
    paid: getRadio(addForm, "paid") === "paid",
    createdAt: Date.now()
  };
  people.push(person);
  savePeople();
  delete addForm.dataset.confirmDup;
  nameInput.value = "";
  setRadio(addForm, "paid", "unpaid");
  highlightId = person.id;
  render({ keepScroll: false });
  setFormError("form-error", "");
  updateDupHint("");
  const summary = Tally.summarize(people);
  announce(`Added ${person.name}. ${Tally.peopleLabel(summary.count)} on the list, ${Tally.shirtsLabel(summary.shirts)}.`);
  const hiddenByFilter = isFiltered() && !visiblePeople().some((item) => item.id === person.id);
  if (hiddenByFilter) showToast(`Added ${person.name}. Clear the filter to see them in the list.`);
  nameInput.focus();
}

function togglePaid(id) {
  const person = findPerson(id);
  if (!person) return;
  person.paid = !person.paid;
  savePeople();
  render();
  const summary = Tally.summarize(people);
  announce(`${person.name} marked ${person.paid ? "paid" : "unpaid"}. Unpaid ${Tally.formatPesos(summary.unpaid)}. Total ${Tally.formatPesos(summary.total)}.`);
}

function removePerson(id) {
  const index = people.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [removed] = people.splice(index, 1);
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

function setQtyField(person, field, rawValue) {
  if (field === "white-qty" || field === "blue-qty") {
    const color = field.startsWith("white") ? "white" : "blue";
    person[color].qty = person[color].size ? Tally.clampQty(rawValue) : 0;
  } else if (field === "xl3" || field === "xl4") {
    person[field] = Tally.clampQty(rawValue);
  }
}

function onRowInput(event) {
  const field = event.target.dataset && event.target.dataset.field;
  if (!field) return;
  const row = event.target.closest("tr");
  const person = row && findPerson(row.dataset.id);
  if (!person) return;

  if (field === "name") {
    person.name = String(event.target.value || "").slice(0, 80);
    scheduleSave();
    return;
  }
  if (field === "white-qty" || field === "blue-qty" || field === "xl3" || field === "xl4") {
    setQtyField(person, field, event.target.value);
    updatePriceCell(row, person);
    renderTotals();
    scheduleSave();
  }
}

function onRowChange(event) {
  const field = event.target.dataset && event.target.dataset.field;
  if (!field) return;
  const row = event.target.closest("tr");
  const person = row && findPerson(row.dataset.id);
  if (!person) return;

  if (field === "name") {
    const cleaned = Tally.cleanName(event.target.value);
    if (Tally.isValidName(cleaned)) {
      person.name = cleaned;
      event.target.value = cleaned;
    } else {
      event.target.value = person.name;
      showToast("A name is needed for every row.");
    }
    savePeople();
    renderTotals();
    return;
  }

  if (field === "white-size" || field === "blue-size") {
    const color = field.startsWith("white") ? "white" : "blue";
    const order = person[color];
    order.size = Tally.priceFor(event.target.value) != null ? event.target.value : "";
    if (!order.size) order.qty = 0;
    else if (!order.qty) order.qty = 1;
    syncColorInputs(row, person, color);
    updatePriceCell(row, person);
    renderTotals();
    savePeople();
    return;
  }

  if (field === "white-qty" || field === "blue-qty" || field === "xl3" || field === "xl4") {
    setQtyField(person, field, event.target.value);
    event.target.value = String(field.endsWith("-qty") ? splitColorField(person, field) : person[field]);
    updatePriceCell(row, person);
    renderTotals();
    savePeople();
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

function buildCsv() {
  const summary = Tally.summarize(people);
  const rows = [
    ["Name", "White size", "White qty", "Blue size", "Blue qty", "3XL", "4XL", "Price", "Status"],
    ...people.map((person) => [
      person.name,
      person.white.size,
      person.white.qty,
      person.blue.size,
      person.blue.qty,
      person.xl3,
      person.xl4,
      Tally.personPrice(person),
      person.paid ? "Paid" : "Unpaid"
    ])
  ];
  rows.push([]);
  rows.push(["SUMMARY"]);
  rows.push(["Color", ...Tally.SIZES, "Shirts", "Amount"]);
  rows.push([
    "White",
    ...Tally.SIZES.map((size) => summary.grid.white[size]),
    summary.colorCount.white,
    summary.colorAmount.white
  ]);
  rows.push([
    "Blue",
    ...Tally.SIZES.map((size) => summary.grid.blue[size]),
    summary.colorCount.blue,
    summary.colorAmount.blue
  ]);
  rows.push([
    "3XL/4XL extra",
    ...Tally.SIZES.map((size) => summary.extras[size]),
    summary.colorCount.extra,
    summary.colorAmount.extra
  ]);
  rows.push([
    "Total",
    ...Tally.SIZES.map((size) => summary.sizeCount[size]),
    summary.shirts,
    summary.total
  ]);
  rows.push([]);
  rows.push(["People", summary.count]);
  rows.push(["Shirts", summary.shirts]);
  rows.push(["Paid", summary.paid]);
  rows.push(["Unpaid", summary.unpaid]);
  rows.push(["Total", summary.total]);
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
}

function downloadBackup() {
  const payload = {
    app: "TEAM ELITE PH TSHIRT",
    version: 2,
    exportedAt: new Date().toISOString(),
    people
  };
  download(
    `team-elite-ph-tshirt-backup-${fileDate()}.json`,
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
    `3XL extra ${summary.extras["3XL"]} · 4XL extra ${summary.extras["4XL"]}`,
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
    ...unpaid.map((person, index) => `${index + 1}. ${person.name} — ${describePerson(person)} — ${Tally.formatPesos(Tally.personPrice(person))}`),
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
    const legacy = item && item.size != null && item.color != null && !item.white && !item.blue;
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
}

/* ---------- wiring ---------- */

function bind() {
  addForm.addEventListener("submit", addPerson);
  addForm.addEventListener("input", () => {
    delete addForm.dataset.confirmDup;
    setFormError("form-error", "");
    updateDupHint(Tally.cleanName(nameInput.value));
  });

  tbody.addEventListener("input", onRowInput);
  tbody.addEventListener("change", onRowChange);
  tbody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.closest("tr")?.dataset.id;
    if (!id) return;
    if (button.dataset.action === "toggle") togglePaid(id);
    if (button.dataset.action === "remove") removePerson(id);
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
  document.getElementById("export-csv").addEventListener("click", exportCsv);
  document.getElementById("print-btn").addEventListener("click", () => window.print());
  document.getElementById("backup-btn").addEventListener("click", downloadBackup);
  document.getElementById("restore-btn").addEventListener("click", () => document.getElementById("restore-file").click());
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
      if (!modal.hidden) closeConfirm();
      return;
    }
    if (!modal.hidden) trapTab(event, modal);
  });

  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);

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
  people = loadPeople();
  bind();
  render();
  if (pendingNotice) showToast(pendingNotice);
  if (!window.matchMedia || !window.matchMedia("(max-width: 800px)").matches) {
    nameInput.focus();
  }
}

init();
