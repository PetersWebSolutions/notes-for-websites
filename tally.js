"use strict";

/*
 * TEAM ELITE PH TSHIRT prices, in Philippine pesos.
 * S, M, L, XL — 399
 * 2XL, 3XL, 4XL — 449
 * Price depends on size only. White and blue cost the same.
 *
 * One person is one row. Each person can order white and blue shirts,
 * each color with its own size and quantity, plus extra 3XL / 4XL shirts.
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
  const EXTRA_SIZES = ["3XL", "4XL"];
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

  function emptyColor() {
    return { size: "", qty: 0 };
  }

  function normalizeColor(value) {
    const size = value && priceFor(value.size) != null ? value.size : "";
    return { size, qty: size ? clampQty(value.qty) : 0 };
  }

  function hasColorOrder(color) {
    return Boolean(color) && priceFor(color.size) != null && clampQty(color.qty) > 0;
  }

  function colorShirts(color) {
    return hasColorOrder(color) ? clampQty(color.qty) : 0;
  }

  function isPerson(person) {
    return Boolean(person)
      && typeof person.id === "string"
      && person.id.length > 0
      && isValidName(cleanName(person.name))
      && typeof person.paid === "boolean"
      && Boolean(person.white)
      && Boolean(person.blue);
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
    return {
      id,
      name,
      white: normalizeColor(raw.white),
      blue: normalizeColor(raw.blue),
      xl3: clampQty(raw.xl3),
      xl4: clampQty(raw.xl4),
      paid: raw.paid === true,
      createdAt: Number(raw.createdAt) || 0
    };
  }

  /* Older versions stored one shirt per row ({ name, size, color, paid }). */
  function migrateLegacyOrder(order, makeId) {
    if (!order || typeof order !== "object") return null;
    const name = cleanName(order.name);
    if (!isValidName(name)) return null;
    const size = priceFor(order.size) != null ? order.size : null;
    if (!size) return null;
    const color = order.color === "white" || order.color === "blue" ? order.color : null;
    if (!color) return null;
    return normalizePerson({
      id: order.id,
      name,
      white: color === "white" ? { size, qty: 1 } : emptyColor(),
      blue: color === "blue" ? { size, qty: 1 } : emptyColor(),
      xl3: 0,
      xl4: 0,
      paid: order.paid === true,
      createdAt: order.createdAt
    }, makeId);
  }

  function personShirts(person) {
    if (!person) return 0;
    return colorShirts(person.white)
      + colorShirts(person.blue)
      + clampQty(person.xl3)
      + clampQty(person.xl4);
  }

  function personPrice(person) {
    if (!person) return 0;
    const white = person.white || emptyColor();
    const blue = person.blue || emptyColor();
    const whiteShirts = colorShirts(white);
    const blueShirts = colorShirts(blue);
    return whiteShirts * priceFor(white.size)
      + blueShirts * priceFor(blue.size)
      + (clampQty(person.xl3) + clampQty(person.xl4)) * PRICES["3XL"];
  }

  function emptySizeMap(value) {
    return Object.fromEntries(SIZES.map((size) => [size, value]));
  }

  function summarize(people) {
    const list = (people || []).filter((person) =>
      person && isValidName(cleanName(person.name)) && typeof person.paid === "boolean");

    const grid = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    const amounts = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    const extras = emptySizeMap(0);
    let paid = 0;
    let unpaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let shirts = 0;
    let extraCount = 0;
    let extraAmount = 0;

    list.forEach((person) => {
      COLORS.forEach((color) => {
        const order = normalizeColor(person[color]);
        const qty = colorShirts(order);
        if (!qty) return;
        const price = PRICES[order.size];
        grid[color][order.size] += qty;
        amounts[color][order.size] += qty * price;
      });

      const xl3 = clampQty(person.xl3);
      const xl4 = clampQty(person.xl4);
      extras["3XL"] += xl3;
      extras["4XL"] += xl4;
      extraCount += xl3 + xl4;
      extraAmount += (xl3 + xl4) * PRICES["3XL"];

      const price = personPrice(person);
      shirts += personShirts(person);
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
      blue: SIZES.reduce((sum, size) => sum + grid.blue[size], 0),
      extra: extraCount
    };
    const colorAmount = {
      white: SIZES.reduce((sum, size) => sum + amounts.white[size], 0),
      blue: SIZES.reduce((sum, size) => sum + amounts.blue[size], 0),
      extra: extraAmount
    };
    const sizeCount = Object.fromEntries(
      SIZES.map((size) => [size, grid.white[size] + grid.blue[size] + extras[size]])
    );
    const sizeAmount = Object.fromEntries(
      SIZES.map((size) => [
        size,
        amounts.white[size] + amounts.blue[size] + extras[size] * PRICES[size]
      ])
    );

    return {
      grid,
      amounts,
      extras,
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
    const samePremium = EXTRA_SIZES.every((size) => PRICES[size] === premium) && PRICES["2XL"] === premium;
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
    EXTRA_SIZES,
    PRICES,
    priceFor,
    cleanName,
    isValidName,
    clampQty,
    emptyColor,
    normalizeColor,
    hasColorOrder,
    isPerson,
    normalizePerson,
    migrateLegacyOrder,
    personShirts,
    personPrice,
    summarize,
    formatPesos,
    peopleLabel,
    shirtsLabel,
    priceLegend
  };
});
