"use strict";

const Tally = window.Tally;
const STORAGE_KEY = "team-elite-ph-tshirt-orders-v1";
const DRAFT_KEY = "team-elite-ph-tshirt-draft-v1";

const addForm = document.getElementById("add-form");
const editForm = document.getElementById("edit-form");
const editModal = document.getElementById("edit-modal");
const confirmModal = document.getElementById("confirm-modal");
const nameInput = document.getElementById("name-input");
const searchInput = document.getElementById("search");
const sizeFilterEl = document.getElementById("size-filter");
const sortEl = document.getElementById("sort-orders");
const toastEl = document.getElementById("toast");
const liveEl = document.getElementById("live");

let orders = [];
let filter = "all";
let sizeFilter = "all";
let sortMode = "entry";
let query = "";
let highlightId = null;
let pendingNotice = "";
let lastTotal = null;
let toastTimer = 0;
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

function readForm(form) {
  return {
    name: Tally.cleanName(form.querySelector('[name="person"]').value),
    size: getRadio(form, "size"),
    color: getRadio(form, "color"),
    paid: getRadio(form, "paid") === "paid"
  };
}

function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : [];
    const valid = arr.filter(Tally.isOrder);
    if (valid.length !== arr.length) {
      pendingNotice = "Some saved rows were skipped because they were incomplete.";
    }
    return valid.slice(0, Tally.MAX_PEOPLE);
  } catch (error) {
    pendingNotice = "Could not read the saved list. Starting fresh on this device.";
    return [];
  }
}

function saveOrders() {
  const state = document.getElementById("save-state");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    state.classList.remove("is-error");
    state.textContent = `Saved on this device only — not uploaded. ${stamp()}`;
  } catch (error) {
    state.classList.add("is-error");
    state.textContent = "Could not save on this device. Export a backup before you leave.";
  }
}

function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(readForm(addForm)));
  } catch (error) {
    /* Draft is a convenience. The order list is what matters. */
  }
}

function loadDraft() {
  try {
    const data = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (!data) return;
    if (data.name) nameInput.value = data.name;
    if (Tally.priceFor(data.size)) setRadio(addForm, "size", data.size);
    if (data.color === "white" || data.color === "blue") setRadio(addForm, "color", data.color);
    setRadio(addForm, "paid", data.paid ? "paid" : "unpaid");
  } catch (error) {
    sessionStorage.removeItem(DRAFT_KEY);
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

function isFiltered() {
  return query.trim() !== "" || filter !== "all" || sizeFilter !== "all";
}

function visibleOrders() {
  let list = orders.slice();
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((order) => order.name.toLowerCase().includes(q));
  if (filter === "paid") list = list.filter((order) => order.paid);
  if (filter === "unpaid") list = list.filter((order) => !order.paid);
  if (filter === "white") list = list.filter((order) => order.color === "white");
  if (filter === "blue") list = list.filter((order) => order.color === "blue");
  if (sizeFilter !== "all") list = list.filter((order) => order.size === sizeFilter);

  const byTime = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
  if (sortMode === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || byTime(a, b));
  } else if (sortMode === "unpaid") {
    list.sort((a, b) => Number(a.paid) - Number(b.paid) || byTime(a, b));
  } else if (sortMode === "size") {
    list.sort((a, b) => Tally.SIZES.indexOf(a.size) - Tally.SIZES.indexOf(b.size) || byTime(a, b));
  } else if (sortMode === "color") {
    list.sort((a, b) => a.color.localeCompare(b.color) || byTime(a, b));
  }
  return list;
}

function entryNumber(order) {
  return orders.findIndex((item) => item.id === order.id) + 1;
}

function colorCell(color, label, order) {
  const cell = h("td", { class: `col-${color}`, "data-label": label });
  if (order.color === color) {
    cell.append(h("span", {
      class: `size-pill ${color}`,
      text: order.size,
      title: `${colorLabel(color)} ${order.size}`
    }));
  } else {
    cell.append(
      h("span", { class: "dash", "aria-hidden": "true", text: "—" }),
      h("span", { class: "sr-only", text: "None" })
    );
  }
  return cell;
}

function renderRow(order) {
  const price = Tally.PRICES[order.size];
  const row = h("tr", {
    "data-id": order.id,
    class: `${order.paid ? "is-paid" : "is-unpaid"}${order.id === highlightId ? " is-new" : ""}`
  });
  const nameCell = h("th", { scope: "row", class: "col-name", "data-label": "NAME" });
  nameCell.append(h("div", { class: "name-wrap" },
    h("span", { class: "num", text: String(entryNumber(order)).padStart(3, "0") }),
    h("span", { class: "who" },
      h("span", { class: "who-name", text: order.name }),
      h("span", { class: "who-meta", text: `${order.size} · ${colorLabel(order.color)}` })
    )
  ));

  const status = h("td", { class: "col-status", "data-label": "PAID/UNPAID" });
  status.append(h("button", {
    type: "button",
    class: `pay-pill ${order.paid ? "is-paid" : "is-unpaid"}`,
    "data-action": "toggle",
    "aria-pressed": order.paid ? "true" : "false",
    "aria-label": `${order.paid ? "Mark unpaid" : "Mark paid"}: ${order.name}`,
    text: order.paid ? "PAID" : "UNPAID"
  }));

  const actions = h("td", { class: "col-actions no-print", "data-label": "Actions" });
  actions.append(
    h("button", { type: "button", class: "text-btn", "data-action": "edit", text: "Edit", "aria-label": `Edit ${order.name}` }),
    h("button", { type: "button", class: "text-btn danger", "data-action": "remove", text: "Remove", "aria-label": `Remove ${order.name}` })
  );

  row.append(
    nameCell,
    colorCell("white", "WHITE", order),
    colorCell("blue", "BLUE", order),
    h("td", {
      class: `col-price${order.size === "2XL" ? " is-premium" : ""}`,
      "data-label": "PRICE",
      text: Tally.formatPesos(price)
    }),
    status,
    actions
  );
  return row;
}

function renderFoot(shown, full) {
  const foot = document.getElementById("order-foot");
  const summary = Tally.summarize(shown);
  const filtered = isFiltered();
  const name = h("th", { scope: "row", class: "col-name", "data-label": "NAME" });
  name.append(
    h("span", { class: "foot-label", text: filtered ? "SHOWN" : "TOTAL" }),
    h("span", { class: "foot-count", text: Tally.peopleLabel(summary.count) })
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
    const count = color ? summary.colorCount[color] : summary.count;
    const amount = color ? summary.colorAmount[color] : summary.total;
    return h("tr", { class: color ? `${color}-row` : "total-row" },
      h("td", { class: "row-label", text: label }),
      ...Tally.SIZES.map((size) => countCell(color ? summary.grid[color][size] : summary.sizeCount[size])),
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
  document.getElementById("sum-paid").textContent = Tally.formatPesos(summary.paid);
  document.getElementById("sum-unpaid").textContent = Tally.formatPesos(summary.unpaid);
  document.getElementById("sum-people").textContent = `${Tally.peopleLabel(summary.count)} · ${summary.colorCount.white} white · ${summary.colorCount.blue} blue`;
  document.getElementById("sum-paid-count").textContent = `${summary.paidCount} paid`;
  document.getElementById("sum-unpaid-count").textContent = `${summary.unpaidCount} unpaid`;
  document.getElementById("updated-at").textContent = isFiltered()
    ? "This total is the full list, not just the rows shown above."
    : orders.length
      ? `Full list · updated ${stamp()}`
      : "Full list · no one added yet";
  document.getElementById("price-note").textContent = `S, M, L, and XL are ${Tally.formatPesos(Tally.PRICES.S)}. 2XL is ${Tally.formatPesos(Tally.PRICES["2XL"])}.`;
  renderMatrix(summary);

  const empty = orders.length === 0;
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
      barStat("WHITE", String(summary.colorCount.white)),
      barStat("BLUE", String(summary.colorCount.blue))
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
  const left = Tally.MAX_PEOPLE - orders.length;
  document.getElementById("header-count").textContent = `${orders.length} / ${Tally.MAX_PEOPLE}`;
  const meter = document.getElementById("meter");
  meter.setAttribute("aria-valuenow", String(orders.length));
  meter.classList.toggle("is-warn", left > 0 && left <= 30);
  meter.classList.toggle("is-full", left === 0);
  document.getElementById("meter-fill").style.width = `${(orders.length / Tally.MAX_PEOPLE) * 100}%`;
  document.getElementById("spots-left").textContent = left === 0
    ? "List is full"
    : `${left} ${left === 1 ? "spot" : "spots"} left`;
  document.getElementById("full-banner").hidden = left !== 0;
  document.getElementById("add-btn").disabled = left === 0;

  const shown = visibleOrders();
  document.getElementById("result-count").textContent = isFiltered()
    ? `Showing ${Tally.peopleLabel(shown.length)} of ${orders.length}`
    : (orders.length ? Tally.peopleLabel(orders.length) : "No one yet");

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.filter === filter ? "true" : "false");
  });

  document.title = orders.length
    ? `(${Tally.formatPesos(summary.total)}) TEAM ELITE PH TSHIRT`
    : "TEAM ELITE PH TSHIRT";
}

function render(options = {}) {
  const keepScroll = options.keepScroll !== false;
  const scrollY = window.scrollY;
  const summary = Tally.summarize(orders);
  const shown = visibleOrders();
  document.getElementById("empty-state").hidden = orders.length !== 0;
  document.getElementById("no-match").hidden = orders.length === 0 || shown.length !== 0;
  document.getElementById("sheet").hidden = shown.length === 0;
  document.getElementById("order-body").replaceChildren(...shown.map(renderRow));
  highlightId = null;
  if (shown.length) renderFoot(shown, summary);
  renderMeta(summary);
  renderSummary(summary);
  renderTotalBar(summary);
  refreshAddForm();
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

function refreshAddForm() {
  const draft = readForm(addForm);
  const price = Tally.priceFor(draft.size);
  const summary = Tally.summarize(orders);
  const priceText = price == null ? "—" : Tally.formatPesos(price);
  setText("shirt-price", priceText);
  setText("shirt-detail", describeSelection(draft.size, draft.color));
  setText("inline-price", price == null ? "Price: —" : `Price: ${priceText}`);
  setText("running-total", Tally.formatPesos(summary.total));
  const after = document.getElementById("after-add");
  const ready = price != null && draft.color && draft.name && orders.length < Tally.MAX_PEOPLE;
  after.hidden = !ready;
  if (ready) after.textContent = `After adding: ${Tally.formatPesos(summary.total + price)}`;

  const button = document.getElementById("add-btn");
  if (orders.length >= Tally.MAX_PEOPLE) button.textContent = "List is full";
  else if (addForm.dataset.confirmDup === "1") button.textContent = "Add anyway";
  else if (ready) button.textContent = `Add to list · ${Tally.formatPesos(price)}`;
  else button.textContent = "Add to list";

  updateDupHint(draft.name);
}

function describeSelection(size, color) {
  if (!size && !color) return "Choose a size and a color";
  if (size && !color) return `${size} · choose white or blue`;
  if (!size && color) return `${colorLabel(color)} · choose a size`;
  return `${size} · ${colorLabel(color, true)}`;
}

function updateDupHint(name) {
  const hint = document.getElementById("dup-hint");
  const matches = name
    ? orders.filter((order) => order.name.toLowerCase() === name.toLowerCase())
    : [];
  if (!matches.length) {
    hint.hidden = true;
    hint.textContent = "";
    return;
  }
  const detail = matches.map((order) => `${order.size} ${colorLabel(order.color)} · ${order.paid ? "Paid" : "Unpaid"}`).join("; ");
  hint.hidden = false;
  hint.textContent = matches.length === 1
    ? `Already on the list: ${detail}. You can still add another shirt.`
    : `Already on the list ${matches.length} times: ${detail}. You can still add another shirt.`;
}

function validateDraft(draft, errorId, form) {
  if (!draft.name || !Tally.isValidName(draft.name)) {
    setFormError(errorId, "Enter the person's name.");
    form.querySelector('[name="person"]').focus();
    return false;
  }
  if (!Tally.priceFor(draft.size)) {
    setFormError(errorId, "Choose a size: S, M, L, XL, or 2XL.");
    form.querySelector('input[name="size"]')?.focus();
    return false;
  }
  if (draft.color !== "white" && draft.color !== "blue") {
    setFormError(errorId, "Choose a color: white or blue.");
    form.querySelector('input[name="color"]')?.focus();
    return false;
  }
  setFormError(errorId, "");
  return true;
}

function addOrder(event) {
  event.preventDefault();
  if (orders.length >= Tally.MAX_PEOPLE) {
    setFormError("form-error", "The list is full at 300 people. Remove someone to add another.");
    return;
  }
  const draft = readForm(addForm);
  if (!validateDraft(draft, "form-error", addForm)) return;

  const exact = orders.find((order) =>
    order.name.toLowerCase() === draft.name.toLowerCase()
    && order.size === draft.size
    && order.color === draft.color
  );
  if (exact && addForm.dataset.confirmDup !== "1") {
    addForm.dataset.confirmDup = "1";
    setFormError("form-error", `${draft.name} already has ${draft.size} ${colorLabel(draft.color)}. Press Add anyway to add another shirt.`);
    refreshAddForm();
    return;
  }

  const order = {
    id: uid(),
    name: draft.name,
    size: draft.size,
    color: draft.color,
    paid: draft.paid,
    createdAt: Date.now()
  };
  orders.push(order);
  saveOrders();
  delete addForm.dataset.confirmDup;
  nameInput.value = "";
  setRadio(addForm, "paid", "unpaid");
  saveDraft();
  highlightId = order.id;
  const hiddenByFilter = isFiltered() && !visibleOrders().some((item) => item.id === order.id);
  render({ keepScroll: false });
  setFormError("form-error", "");
  const summary = Tally.summarize(orders);
  announce(`Added ${order.name}, ${order.size} ${colorLabel(order.color)}, ${Tally.formatPesos(Tally.PRICES[order.size])}. Total ${Tally.formatPesos(summary.total)}.`);
  if (hiddenByFilter) showToast(`Added ${order.name}. Clear the filter to see them in the list.`);
  nameInput.focus();
}

function togglePaid(id) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;
  order.paid = !order.paid;
  saveOrders();
  render();
  const summary = Tally.summarize(orders);
  announce(`${order.name} marked ${order.paid ? "paid" : "unpaid"}. Unpaid ${Tally.formatPesos(summary.unpaid)}. Total ${Tally.formatPesos(summary.total)}.`);
}

function removeOrder(id) {
  const index = orders.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [removed] = orders.splice(index, 1);
  saveOrders();
  render();
  announce(`Removed ${removed.name}.`);
  showToast(`Removed ${removed.name}.`, "Undo", () => {
    orders.splice(Math.min(index, orders.length), 0, removed);
    saveOrders();
    render();
    announce(`${removed.name} is back on the list.`);
  });
}

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

function openEdit(id) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;
  editForm.querySelector('[name="id"]').value = order.id;
  editForm.querySelector('[name="person"]').value = order.name;
  setRadio(editForm, "size", order.size);
  setRadio(editForm, "color", order.color);
  setRadio(editForm, "paid", order.paid ? "paid" : "unpaid");
  setFormError("edit-error", "");
  refreshEditPrice();
  openModal(editModal);
  editForm.querySelector('[name="person"]').focus();
}

function closeEdit() {
  closeModal(editModal);
}

function refreshEditPrice() {
  const draft = readForm(editForm);
  const price = Tally.priceFor(draft.size);
  document.getElementById("edit-price").textContent = price == null
    ? "Price: —"
    : `Price: ${Tally.formatPesos(price)}${draft.color ? ` · ${draft.size} ${colorLabel(draft.color, true)}` : ""}`;
}

function saveEdit(event) {
  event.preventDefault();
  const id = editForm.querySelector('[name="id"]').value;
  const order = orders.find((item) => item.id === id);
  if (!order) {
    closeEdit();
    return;
  }
  const draft = readForm(editForm);
  if (!validateDraft(draft, "edit-error", editForm)) return;
  order.name = draft.name;
  order.size = draft.size;
  order.color = draft.color;
  order.paid = draft.paid;
  saveOrders();
  closeEdit();
  render();
  announce(`Updated ${order.name}. Total ${Tally.formatPesos(Tally.summarize(orders).total)}.`);
}

function openConfirm(options) {
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
  openModal(confirmModal);
  document.getElementById("confirm-cancel").focus();
}

function closeConfirm() {
  confirmHandler = null;
  extraHandler = null;
  closeModal(confirmModal);
}

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
  const summary = Tally.summarize(orders);
  const rows = [
    ["Name", "Size", "Color", "Price", "Status"],
    ...orders.map((order) => [
      order.name,
      order.size,
      colorLabel(order.color),
      Tally.PRICES[order.size],
      order.paid ? "Paid" : "Unpaid"
    ])
  ];
  rows.push([]);
  rows.push(["SUMMARY"]);
  rows.push(["Color", ...Tally.SIZES, "Shirts", "Amount"]);
  ["white", "blue"].forEach((color) => {
    rows.push([
      colorLabel(color),
      ...Tally.SIZES.map((size) => summary.grid[color][size]),
      summary.colorCount[color],
      summary.colorAmount[color]
    ]);
  });
  rows.push(["Total", ...Tally.SIZES.map((size) => summary.sizeCount[size]), summary.count, summary.total]);
  rows.push([]);
  rows.push(["Paid", summary.paid]);
  rows.push(["Unpaid", summary.unpaid]);
  rows.push(["Total", summary.total]);
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
}

function downloadBackup() {
  const payload = {
    app: "TEAM ELITE PH TSHIRT",
    version: 1,
    exportedAt: new Date().toISOString(),
    orders
  };
  download(
    `team-elite-ph-tshirt-backup-${fileDate()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}

function exportCsv() {
  if (!orders.length) return;
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
  const summary = Tally.summarize(orders);
  const line = (color) => Tally.SIZES.map((size) => `${size} ${summary.grid[color][size]}`).join("  ");
  return [
    "TEAM ELITE PH TSHIRT",
    Tally.peopleLabel(summary.count),
    `White — ${line("white")}`,
    `Blue — ${line("blue")}`,
    `Total: ${Tally.formatPesos(summary.total)}`,
    `Paid: ${Tally.formatPesos(summary.paid)} (${summary.paidCount})`,
    `Unpaid: ${Tally.formatPesos(summary.unpaid)} (${summary.unpaidCount})`
  ].join("\n");
}

function unpaidText() {
  const unpaid = orders.filter((order) => !order.paid);
  const summary = Tally.summarize(orders);
  if (!unpaid.length) return "TEAM ELITE PH TSHIRT\nEveryone is paid.";
  return [
    "UNPAID — TEAM ELITE PH TSHIRT",
    ...unpaid.map((order, index) => `${index + 1}. ${order.name} — ${order.size} ${colorLabel(order.color)} — ${Tally.formatPesos(Tally.PRICES[order.size])}`),
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
  const arr = Array.isArray(data) ? data : data && Array.isArray(data.orders) ? data.orders : null;
  if (!arr) throw new Error("This file is not a Team Elite shirt backup.");
  const valid = arr.filter(Tally.isOrder);
  if (valid.length > Tally.MAX_PEOPLE) {
    throw new Error(`That backup has ${valid.length} people. This list holds 300.`);
  }
  if (!valid.length) throw new Error("No usable people were found in that backup.");
  return { valid, skipped: arr.length - valid.length };
}

function applyRestore(valid, skipped) {
  const go = () => {
    orders = valid;
    saveOrders();
    render();
    showToast(skipped
      ? `Restored ${Tally.peopleLabel(valid.length)}. ${skipped} ${skipped === 1 ? "row was" : "rows were"} skipped.`
      : `Restored ${Tally.peopleLabel(valid.length)}.`);
  };
  if (!orders.length) {
    go();
    return;
  }
  openConfirm({
    title: "Replace the current list?",
    body: `This device already has ${Tally.peopleLabel(orders.length)}. Replacing it cannot be undone unless you downloaded a backup.`,
    confirmLabel: "Replace list",
    danger: true,
    extraLabel: "Download backup first",
    onExtra: downloadBackup,
    onConfirm: go
  });
}

function clearFilters() {
  filter = "all";
  sizeFilter = "all";
  query = "";
  searchInput.value = "";
  sizeFilterEl.value = "all";
  render();
}

function beforePrint() {
  printSnapshot = { filter, sizeFilter, sortMode, query, search: searchInput.value };
  filter = "all";
  sizeFilter = "all";
  sortMode = "entry";
  query = "";
  searchInput.value = "";
  sizeFilterEl.value = "all";
  sortEl.value = "entry";
  document.getElementById("print-stamp").textContent = `Full list · printed ${stamp()}`;
  render();
}

function afterPrint() {
  if (!printSnapshot) return;
  ({ filter, sizeFilter, sortMode, query } = printSnapshot);
  searchInput.value = printSnapshot.search;
  sizeFilterEl.value = sizeFilter;
  sortEl.value = sortMode;
  printSnapshot = null;
  render();
}

function fillPrices() {
  document.getElementById("price-legend").textContent = Tally.priceLegend();
  document.querySelectorAll("[data-price-for]").forEach((el) => {
    const price = Tally.priceFor(el.dataset.priceFor);
    if (price != null) el.textContent = Tally.formatPesos(price);
  });
  Tally.SIZES.forEach((size) => {
    sizeFilterEl.append(h("option", { value: size, text: size }));
  });
}

function bind() {
  addForm.addEventListener("submit", addOrder);
  addForm.addEventListener("input", () => {
    delete addForm.dataset.confirmDup;
    setFormError("form-error", "");
    saveDraft();
    refreshAddForm();
  });
  addForm.addEventListener("change", () => {
    saveDraft();
    refreshAddForm();
  });

  editForm.addEventListener("submit", saveEdit);
  editForm.addEventListener("input", refreshEditPrice);
  editForm.addEventListener("change", refreshEditPrice);
  document.getElementById("edit-cancel").addEventListener("click", closeEdit);
  document.getElementById("edit-remove").addEventListener("click", () => {
    const id = editForm.querySelector('[name="id"]').value;
    closeEdit();
    removeOrder(id);
  });

  document.getElementById("order-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.closest("tr")?.dataset.id;
    if (!id) return;
    if (button.dataset.action === "toggle") togglePaid(id);
    if (button.dataset.action === "edit") openEdit(id);
    if (button.dataset.action === "remove") removeOrder(id);
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

  sizeFilterEl.addEventListener("change", () => {
    sizeFilter = sizeFilterEl.value;
    render();
  });
  sortEl.addEventListener("change", () => {
    sortMode = sortEl.value;
    render();
  });
  document.getElementById("clear-filters").addEventListener("click", clearFilters);

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
      applyRestore(parsed.valid, parsed.skipped);
    } catch (error) {
      showToast(error.message || "Could not restore that file.");
    }
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    if (!orders.length) return;
    openConfirm({
      title: "Erase the whole list?",
      body: `This removes ${Tally.peopleLabel(orders.length)} from this device. Download a backup first if you still need the names.`,
      confirmLabel: "Erase list",
      danger: true,
      extraLabel: "Download backup",
      onExtra: downloadBackup,
      onConfirm: () => {
        const snapshot = orders.slice();
        orders = [];
        saveOrders();
        render();
        showToast("List cleared.", "Undo", () => {
          orders = snapshot;
          saveOrders();
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
      if (el.dataset.close === "edit") closeEdit();
      if (el.dataset.close === "confirm") closeConfirm();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!confirmModal.hidden) closeConfirm();
      else if (!editModal.hidden) closeEdit();
      return;
    }
    if (!confirmModal.hidden) trapTab(event, confirmModal);
    else if (!editModal.hidden) trapTab(event, editModal);
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
  orders = loadOrders();
  loadDraft();
  bind();
  render();
  if (pendingNotice) showToast(pendingNotice);
  if (!window.matchMedia || !window.matchMedia("(max-width: 800px)").matches) {
    nameInput.focus();
  }
}

init();
