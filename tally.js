"use strict";

/*
 * TEAM ELITE PH TSHIRT prices, in Philippine pesos.
 * S, M, L, XL — 399
 * 2XL — 449
 * Price depends on size only. White and blue cost the same.
 */
(function (factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Tally = api;
})(function () {
  const MAX_PEOPLE = 300;
  const SIZES = ["S", "M", "L", "XL", "2XL"];
  const COLORS = ["white", "blue"];
  const PRICES = Object.freeze({
    S: 399,
    M: 399,
    L: 399,
    XL: 399,
    "2XL": 449
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

  function isOrder(order) {
    return Boolean(order)
      && typeof order.id === "string"
      && order.id.length > 0
      && isValidName(order.name)
      && priceFor(order.size) != null
      && (order.color === "white" || order.color === "blue")
      && typeof order.paid === "boolean";
  }

  function emptySizeMap(value) {
    return Object.fromEntries(SIZES.map((size) => [size, value]));
  }

  function summarize(orders) {
    const list = (orders || []).filter(isOrder);
    const grid = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    const amounts = { white: emptySizeMap(0), blue: emptySizeMap(0) };
    let paid = 0;
    let unpaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    list.forEach((order) => {
      const price = PRICES[order.size];
      grid[order.color][order.size] += 1;
      amounts[order.color][order.size] += price;
      if (order.paid) {
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
    const sizeCount = Object.fromEntries(SIZES.map((size) => [size, grid.white[size] + grid.blue[size]]));
    const sizeAmount = Object.fromEntries(SIZES.map((size) => [size, amounts.white[size] + amounts.blue[size]]));

    return {
      grid,
      amounts,
      paid,
      unpaid,
      paidCount,
      unpaidCount,
      count: list.length,
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

  function priceLegend() {
    const standard = PRICES.S;
    const same = ["S", "M", "L", "XL"].every((size) => PRICES[size] === standard);
    if (same) {
      return `Prices in pesos: S, M, L, XL — ${formatPesos(standard)}  ·  2XL — ${formatPesos(PRICES["2XL"])}`;
    }
    return `Prices in pesos: ${SIZES.map((size) => `${size} — ${formatPesos(PRICES[size])}`).join("  ·  ")}`;
  }

  return {
    MAX_PEOPLE,
    SIZES,
    COLORS,
    PRICES,
    priceFor,
    cleanName,
    isValidName,
    isOrder,
    summarize,
    formatPesos,
    peopleLabel,
    priceLegend
  };
});
