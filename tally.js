"use strict";

/*
 * TEAM ELITE PH TSHIRT prices, in Philippine pesos.
 * S, M, L, XL — 399
 * 2XL, 3XL, 4XL — 449
 * Price depends on size only. White and blue cost the same.
 *
 * One person is one row. A row holds a list of items, and each item is one
 * color at one size with its own quantity. The people sheet draws those items
 * as a grid: seven size columns for white, seven for blue, then price and
 * payment. The cart is just a list of items before it belongs to a person.
 */
(function (factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Tally = api;
})(function () {
  const MAX_PEOPLE = 300;
  const MAX_QTY = 99;
  const SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];
  const COLORS = ["white", "blue"];
  const PRICES = Object.freeze({
    S: 399,
    M: 399,
    L: 399,
    XL: 399,
    "2XL": 449,
    "3XL": 449,
    "4XL": 449
  });

  function priceFor(size) {
    return Object.prototype.hasOwnProperty.call(PRICES, size) ? PRICES[size] : null;
  }

  function cleanName(value) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function isValidName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= 80 && /[\p{L}\p{N}]/u.test(name);
  }

  function clampQty(value) {
    const n = Math.floor(Number(value) || 0);
    return Math.max(0, Math.min(MAX_QTY, n));
  }

  function isColor(color) {
    return color === "white" || color === "blue";
  }

  function isSize(size) {
    return priceFor(size) != null;
  }

  function emptySizeMap(value) {
    return Object.fromEntries(SIZES.map((size) => [size, value]));
  }

  /* ---------- items ---------- */

  /* One item is one color at one size. A zero quantity is not an item. */
  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isColor(raw.color) || !isSize(raw.size)) return null;
    const qty = clampQty(raw.qty);
    if (!qty) return null;
    return { color: raw.color, size: raw.size, qty };
  }

  /*
   * Clean a list of items and fold repeats of the same color and size into a
   * single line, so the grid never counts the same cell twice. Order comes
   * back as white first, then blue, each in size order.
   */
  function normalizeItems(list) {
    const merged = new Map();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const item = normalizeItem(raw);
      if (!item) return;
      const key = `${item.color}:${item.size}`;
      const prior = merged.get(key);
      merged.set(key, {
        color: item.color,
        size: item.size,
        qty: clampQty((prior ? prior.qty : 0) + item.qty)
      });
    });
    return COLORS.flatMap((color) => SIZES
      .filter((size) => merged.has(`${color}:${size}`))
      .map((size) => merged.get(`${color}:${size}`)));
  }

  /* Add one shirt to a list, or fold it into the matching line. */
  function addItem(items, raw) {
    const item = normalizeItem(raw);
    if (!item) return normalizeItems(items);
    return normalizeItems(normalizeItems(items).concat([item]));
  }

  /* Set one grid cell. A quantity of zero clears that cell. */
  function setCellQty(items, color, size, qty) {
    const next = normalizeItems(items).filter((item) => !(item.color === color && item.size === size));
    const amount = clampQty(qty);
    if (!isColor(color) || !isSize(size) || !amount) return next;
    return normalizeItems(next.concat([{ color, size, qty: amount }]));
  }

  function cellQty(items, color, size) {
    return normalizeItems(items)
      .filter((item) => item.color === color && item.size === size)
      .reduce((sum, item) => sum + item.qty, 0);
  }

  function itemsShirts(items) {
    return normalizeItems(items).reduce((sum, item) => sum + item.qty, 0);
  }

  function itemsPrice(items) {
    return normalizeItems(items).reduce((sum, item) => sum + item.qty * priceFor(item.size), 0);
  }

  /* ---------- people ---------- */

  function personGrid(person) {
    const grid = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    normalizeItems(person && person.items).forEach((item) => {
      grid[item.color][item.size] += item.qty;
    });
    return grid;
  }

  function personShirts(person) {
    return itemsShirts(person && person.items);
  }

  function personPrice(person) {
    return itemsPrice(person && person.items);
  }

  function describePerson(person) {
    const parts = normalizeItems(person && person.items)
      .map((item) => `${item.color} ${item.size} ×${item.qty}`);
    return parts.join(" · ") || "no shirts yet";
  }

  function isPerson(person) {
    return Boolean(person)
      && typeof person.id === "string"
      && person.id.length > 0
      && isValidName(cleanName(person.name))
      && typeof person.paid === "boolean"
      && Array.isArray(person.items);
  }

  /*
   * The first layout kept one white size, one blue size, and two extra
   * big-size columns per person. Those fold into items here. The old extra
   * 3XL and 4XL columns carried no color, so they are read as white.
   */
  function itemsFromOldShape(raw) {
    const items = [];
    COLORS.forEach((color) => {
      const slot = raw[color];
      if (slot && typeof slot === "object" && isSize(slot.size) && clampQty(slot.qty) > 0) {
        items.push({ color, size: slot.size, qty: clampQty(slot.qty) });
      }
    });
    if (clampQty(raw.xl3) > 0) items.push({ color: "white", size: "3XL", qty: clampQty(raw.xl3) });
    if (clampQty(raw.xl4) > 0) items.push({ color: "white", size: "4XL", qty: clampQty(raw.xl4) });
    return items;
  }

  function looksLikeOldShape(raw) {
    return Boolean(raw)
      && (raw.white || raw.blue || raw.xl3 != null || raw.xl4 != null)
      && !Array.isArray(raw.items);
  }

  function normalizePerson(raw, makeId) {
    if (!raw || typeof raw !== "object") return null;
    const name = cleanName(raw.name);
    if (!isValidName(name)) return null;
    let id = typeof raw.id === "string" && raw.id ? raw.id : "";
    if (!id) {
      if (typeof makeId !== "function") return null;
      id = String(makeId());
      if (!id) return null;
    }
    const items = looksLikeOldShape(raw)
      ? normalizeItems(itemsFromOldShape(raw))
      : normalizeItems(raw.items);
    return {
      id,
      name,
      items,
      paid: raw.paid === true,
      createdAt: Number(raw.createdAt) || 0
    };
  }

  /* The oldest data stored one shirt per row ({ name, size, color, paid }). */
  function migrateLegacyOrder(order, makeId) {
    if (!order || typeof order !== "object") return null;
    const name = cleanName(order.name);
    if (!isValidName(name)) return null;
    if (!isSize(order.size) || !isColor(order.color)) return null;
    return normalizePerson({
      id: order.id,
      name,
      items: [{ color: order.color, size: order.size, qty: 1 }],
      paid: order.paid === true,
      createdAt: order.createdAt
    }, makeId);
  }

  /* ---------- totals ---------- */

  function summarize(people) {
    const list = (people || []).filter((person) =>
      person && isValidName(cleanName(person.name)) && typeof person.paid === "boolean");

    const grid = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    const amounts = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    let paid = 0;
    let unpaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let shirts = 0;

    list.forEach((person) => {
      const items = normalizeItems(person.items);
      items.forEach((item) => {
        grid[item.color][item.size] += item.qty;
        amounts[item.color][item.size] += item.qty * priceFor(item.size);
      });

      const price = itemsPrice(items);
      shirts += items.reduce((sum, item) => sum + item.qty, 0);
      if (person.paid) {
        paid += price;
        paidCount += 1;
      } else {
        unpaid += price;
        unpaidCount += 1;
      }
    });

    const colorCount = {
      white: SIZES.reduce((sum, size) => sum + grid.white[size], 0),
      blue: SIZES.reduce((sum, size) => sum + grid.blue[size], 0)
    };
    const colorAmount = {
      white: SIZES.reduce((sum, size) => sum + amounts.white[size], 0),
      blue: SIZES.reduce((sum, size) => sum + amounts.blue[size], 0)
    };
    const sizeCount = Object.fromEntries(
      SIZES.map((size) => [size, grid.white[size] + grid.blue[size]])
    );
    const sizeAmount = Object.fromEntries(
      SIZES.map((size) => [
        size,
        amounts.white[size] + amounts.blue[size]
      ])
    );

    return {
      grid,
      amounts,
      paid,
      unpaid,
      paidCount,
      unpaidCount,
      count: list.length,
      shirts,
      total: paid + unpaid,
      colorCount,
      colorAmount,
      sizeCount,
      sizeAmount
    };
  }

  function formatPesos(amount) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0
    }).format(amount || 0);
  }

  function peopleLabel(count) {
    return count === 1 ? "1 person" : `${count} people`;
  }

  function shirtsLabel(count) {
    return count === 1 ? "1 shirt" : `${count} shirts`;
  }

  function priceLegend() {
    const standard = PRICES.S;
    const premium = PRICES["2XL"];
    const sameStandard = ["S", "M", "L", "XL"].every((size) => PRICES[size] === standard);
    const samePremium = SIZES.slice(4).every((size) => PRICES[size] === premium);
    if (sameStandard && samePremium) {
      return `Prices in pesos: S, M, L, XL — ${formatPesos(standard)}  ·  2XL, 3XL, 4XL — ${formatPesos(premium)}`;
    }
    return `Prices in pesos: ${SIZES.map((size) => `${size} — ${formatPesos(PRICES[size])}`).join("  ·  ")}`;
  }

  return {
    MAX_PEOPLE,
    MAX_QTY,
    SIZES,
    COLORS,
    PRICES,
    priceFor,
    cleanName,
    isValidName,
    clampQty,
    isColor,
    isSize,
    emptySizeMap,
    normalizeItem,
    normalizeItems,
    addItem,
    setCellQty,
    cellQty,
    itemsShirts,
    itemsPrice,
    personGrid,
    personShirts,
    personPrice,
    describePerson,
    isPerson,
    normalizePerson,
    migrateLegacyOrder,
    summarize,
    formatPesos,
    peopleLabel,
    shirtsLabel,
    priceLegend
  };
});
