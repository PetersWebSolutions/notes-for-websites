"use strict";

const assert = require("assert");
const Tally = require("./tally.js");

/* ---------- the price list ---------- */

assert.strictEqual(Tally.MAX_PEOPLE, 300);
assert.strictEqual(Tally.MAX_QTY, 99);
assert.deepStrictEqual(Tally.SIZES, ["S", "M", "L", "XL", "2XL", "3XL", "4XL"]);
assert.deepStrictEqual(Tally.COLORS, ["white", "blue"]);
assert.strictEqual(Tally.PRICES.S, 399);
assert.strictEqual(Tally.PRICES.M, 399);
assert.strictEqual(Tally.PRICES.L, 399);
assert.strictEqual(Tally.PRICES.XL, 399);
assert.strictEqual(Tally.PRICES["2XL"], 449);
assert.strictEqual(Tally.PRICES["3XL"], 449);
assert.strictEqual(Tally.PRICES["4XL"], 449);
assert.strictEqual(Tally.priceFor("M"), 399);
assert.strictEqual(Tally.priceFor("2XL"), 449);
assert.strictEqual(Tally.priceFor("3XL"), 449);
assert.strictEqual(Tally.priceFor("4XL"), 449);
assert.strictEqual(Tally.priceFor("5XL"), null);
assert.strictEqual(Tally.formatPesos(399), "₱399");
assert.strictEqual(Tally.formatPesos(8526), "₱8,526");
assert.strictEqual(Tally.cleanName("  Juan   dela Cruz  "), "Juan dela Cruz");
assert.strictEqual(Tally.cleanName("José\u0000 Niño"), "José Niño");
assert.strictEqual(Tally.isValidName("Ma. Clara"), true);
assert.strictEqual(Tally.isValidName("..."), false);
assert.strictEqual(Tally.isValidName(""), false);
assert.strictEqual(Tally.clampQty("5"), 5);
assert.strictEqual(Tally.clampQty(250), 99);
assert.strictEqual(Tally.clampQty(-3), 0);
assert.strictEqual(Tally.clampQty("abc"), 0);
assert.strictEqual(Tally.peopleLabel(1), "1 person");
assert.strictEqual(Tally.peopleLabel(0), "0 people");
assert.strictEqual(Tally.shirtsLabel(1), "1 shirt");
assert.strictEqual(Tally.shirtsLabel(3), "3 shirts");
assert.ok(Tally.priceLegend().includes("₱399"));
assert.ok(Tally.priceLegend().includes("₱449"));

/* ---------- items ---------- */

/* An item needs a real color and a real size, and a quantity above zero. */
assert.deepStrictEqual(Tally.normalizeItem({ color: "white", size: "L", qty: 2 }), { color: "white", size: "L", qty: 2 });
assert.deepStrictEqual(Tally.normalizeItem({ color: "red", size: "L", qty: 2 }), null);
assert.deepStrictEqual(Tally.normalizeItem({ color: "blue", size: "5XL", qty: 2 }), null);
assert.deepStrictEqual(Tally.normalizeItem({ color: "blue", size: "L", qty: 0 }), null);
assert.deepStrictEqual(Tally.normalizeItem(null), null);

/* Repeats of the same cell fold into one line, white first then blue. */
assert.deepStrictEqual(Tally.normalizeItems([
  { color: "blue", size: "4XL", qty: 1 },
  { color: "white", size: "M", qty: 2 },
  { color: "white", size: "M", qty: 3 }
]), [
  { color: "white", size: "M", qty: 5 },
  { color: "blue", size: "4XL", qty: 1 }
]);
assert.deepStrictEqual(Tally.normalizeItems(null), []);
assert.deepStrictEqual(Tally.normalizeItems([{ color: "white", size: "M", qty: 200 }]), [
  { color: "white", size: "M", qty: 99 }
]);

/* ADD from the order form adds a shirt, or tops up the same cell. */
assert.deepStrictEqual(Tally.addItem([], { color: "white", size: "M", qty: 2 }), [
  { color: "white", size: "M", qty: 2 }
]);
assert.deepStrictEqual(Tally.addItem(
  [{ color: "white", size: "M", qty: 2 }],
  { color: "white", size: "M", qty: 1 }
), [{ color: "white", size: "M", qty: 3 }]);
assert.deepStrictEqual(Tally.addItem([{ color: "white", size: "M", qty: 1 }], { color: "red", size: "M", qty: 1 }), [
  { color: "white", size: "M", qty: 1 }
]);

/* EDIT sets one cell, and zero clears it. */
assert.deepStrictEqual(Tally.setCellQty(
  [{ color: "white", size: "M", qty: 2 }, { color: "blue", size: "S", qty: 1 }],
  "white",
  "M",
  4
), [
  { color: "white", size: "M", qty: 4 },
  { color: "blue", size: "S", qty: 1 }
]);
assert.deepStrictEqual(Tally.setCellQty(
  [{ color: "white", size: "M", qty: 2 }, { color: "blue", size: "S", qty: 1 }],
  "white",
  "M",
  0
), [{ color: "blue", size: "S", qty: 1 }]);
/* Editing an empty cell adds that shirt. */
assert.deepStrictEqual(Tally.setCellQty([], "blue", "3XL", 2), [
  { color: "blue", size: "3XL", qty: 2 }
]);
assert.strictEqual(Tally.setCellQty([{ color: "blue", size: "S", qty: 1 }], "blue", "9XL", 3).length, 1);

assert.strictEqual(Tally.cellQty([{ color: "white", size: "M", qty: 2 }], "white", "M"), 2);
assert.strictEqual(Tally.cellQty([{ color: "white", size: "M", qty: 2 }], "white", "L"), 0);
assert.strictEqual(Tally.cellQty([], "blue", "M"), 0);

/* ---------- people ---------- */

const ana = {
  id: "1",
  name: "Ana Reyes",
  items: [
    { color: "white", size: "M", qty: 2 },
    { color: "blue", size: "2XL", qty: 1 }
  ],
  paid: true
};
const ben = {
  id: "2",
  name: "Ben Cruz",
  items: [
    { color: "blue", size: "4XL", qty: 1 },
    { color: "blue", size: "4XL", qty: 2 },
    { color: "white", size: "S", qty: 1 }
  ],
  paid: false
};

assert.strictEqual(Tally.isPerson(ana), true);
assert.strictEqual(Tally.isPerson({ ...ana, name: "" }), false);
assert.strictEqual(Tally.isPerson({ ...ana, paid: "yes" }), false);
/* A named person with no shirts yet is still a real row. */
assert.strictEqual(Tally.isPerson({ id: "x", name: "Ana", items: [], paid: true }), true);
assert.strictEqual(Tally.isPerson({ id: "x", name: "Ana", items: {}, paid: true }), false);
assert.strictEqual(Tally.isPerson({ id: "", name: "Ana", items: [], paid: true }), false);

/* The grid holds seven sizes per color. */
const anaGrid = Tally.personGrid(ana);
assert.deepStrictEqual(Object.keys(anaGrid.white), Tally.SIZES);
assert.strictEqual(anaGrid.white.M, 2);
assert.strictEqual(anaGrid.white.S, 0);
assert.strictEqual(anaGrid.blue["2XL"], 1);
assert.strictEqual(anaGrid.blue.M, 0);

/* Two lines of the same color and size count as one cell. */
const benGrid = Tally.personGrid(ben);
assert.strictEqual(benGrid.blue["4XL"], 3);
assert.strictEqual(benGrid.white.S, 1);

assert.strictEqual(Tally.personShirts(ana), 3);
assert.strictEqual(Tally.personPrice(ana), 2 * 399 + 449);
assert.strictEqual(Tally.personShirts(ben), 4);
assert.strictEqual(Tally.personPrice(ben), 3 * 449 + 399);
assert.strictEqual(Tally.personShirts(null), 0);
assert.strictEqual(Tally.personPrice(null), 0);
assert.strictEqual(Tally.personShirts({ items: [] }), 0);

assert.strictEqual(Tally.describePerson(ana), "white M ×2 · blue 2XL ×1");
assert.strictEqual(Tally.describePerson({ items: [] }), "no shirts yet");

assert.strictEqual(Tally.itemsShirts([{ color: "white", size: "S", qty: 2 }, { color: "blue", size: "4XL", qty: 1 }]), 3);
assert.strictEqual(Tally.itemsPrice([{ color: "white", size: "S", qty: 2 }, { color: "blue", size: "4XL", qty: 1 }]), 2 * 399 + 449);

/* ---------- totals ---------- */

const summary = Tally.summarize([ana, ben]);
assert.strictEqual(summary.count, 2);
assert.strictEqual(summary.shirts, 7);
assert.strictEqual(summary.total, 2 * 399 + 449 + 3 * 449 + 399);
assert.strictEqual(summary.paid, 2 * 399 + 449);
assert.strictEqual(summary.unpaid, 3 * 449 + 399);
assert.strictEqual(summary.paidCount, 1);
assert.strictEqual(summary.unpaidCount, 1);
assert.strictEqual(summary.colorCount.white, 3);
assert.strictEqual(summary.colorCount.blue, 4);
assert.strictEqual(summary.colorAmount.white, 2 * 399 + 399);
assert.strictEqual(summary.colorAmount.blue, 3 * 449 + 449);
assert.strictEqual(summary.grid.white.M, 2);
assert.strictEqual(summary.grid.white.S, 1);
assert.strictEqual(summary.grid.blue["2XL"], 1);
assert.strictEqual(summary.grid.blue["4XL"], 3);
assert.strictEqual(summary.sizeCount["4XL"], 3);
assert.strictEqual(summary.sizeCount.M, 2);
assert.strictEqual(summary.sizeAmount["4XL"], 3 * 449);
assert.strictEqual(summary.sizeAmount.M, 2 * 399);
/* The whole grid adds up to the shirt count. */
assert.strictEqual(
  Tally.SIZES.reduce((sum, size) => sum + summary.sizeCount[size], 0),
  summary.shirts
);

const empty = Tally.summarize([]);
assert.strictEqual(empty.count, 0);
assert.strictEqual(empty.shirts, 0);
assert.strictEqual(empty.total, 0);
assert.strictEqual(empty.paid, 0);
assert.strictEqual(empty.unpaid, 0);
assert.strictEqual(empty.colorCount.white, 0);
assert.strictEqual(empty.colorCount.blue, 0);

const dirty = Tally.summarize([ana, { id: "x", name: "", items: [{ color: "white", size: "M", qty: 9 }], paid: true }]);
assert.strictEqual(dirty.count, 1);
assert.strictEqual(dirty.total, Tally.personPrice(ana));

/* ---------- stored shapes ---------- */

assert.deepStrictEqual(Tally.normalizePerson({
  id: "9",
  name: "  Cara  Lim ",
  items: [
    { color: "white", size: "S", qty: 150 },
    { color: "blue", size: "", qty: 7 },
    { color: "white", size: "L", qty: 0 }
  ],
  paid: "yes"
}), {
  id: "9",
  name: "Cara Lim",
  items: [{ color: "white", size: "S", qty: 99 }],
  paid: false,
  createdAt: 0
});
assert.strictEqual(Tally.normalizePerson({ name: "No id", paid: true }), null);
assert.strictEqual(Tally.normalizePerson({ name: "No id", paid: true }, () => "made-1").id, "made-1");
assert.strictEqual(Tally.normalizePerson(null), null);

/* The first layout's white and blue sizes become items. */
assert.deepStrictEqual(Tally.normalizePerson({
  id: "5",
  name: "Dan Uy",
  white: { size: "L", qty: 2 },
  blue: { size: "2XL", qty: 1 },
  xl3: 0,
  xl4: 0,
  paid: true
}), {
  id: "5",
  name: "Dan Uy",
  items: [
    { color: "white", size: "L", qty: 2 },
    { color: "blue", size: "2XL", qty: 1 }
  ],
  paid: true,
  createdAt: 0
});

/* The old extra 3XL and 4XL columns carried no color, so they land on white. */
assert.deepStrictEqual(Tally.normalizePerson({
  id: "6",
  name: "Eve Sun",
  white: { size: "3XL", qty: 1 },
  blue: { size: "", qty: 0 },
  xl3: 2,
  xl4: 1,
  paid: false
}).items, [{ color: "white", size: "3XL", qty: 3 }, { color: "white", size: "4XL", qty: 1 }]);

/* Migrating twice lands on the same result. */
const once = Tally.normalizePerson({
  id: "7", name: "Fay", white: { size: "M", qty: 2 }, blue: {}, xl3: 1, xl4: 0, paid: false
});
assert.deepStrictEqual(Tally.normalizePerson(once), once);

/* The oldest data stored one shirt per row. */
const legacy = Tally.migrateLegacyOrder({
  id: "old-1",
  name: "Dan Uy",
  size: "2XL",
  color: "blue",
  paid: true,
  createdAt: 123
});
assert.deepStrictEqual(legacy, {
  id: "old-1",
  name: "Dan Uy",
  items: [{ color: "blue", size: "2XL", qty: 1 }],
  paid: true,
  createdAt: 123
});
assert.strictEqual(Tally.migrateLegacyOrder({ id: "o", name: "Eve", size: "5XL", color: "white", paid: false }), null);
assert.strictEqual(Tally.migrateLegacyOrder({ id: "o", name: "Eve", size: "S", color: "red", paid: false }), null);
assert.strictEqual(Tally.migrateLegacyOrder(null), null);

console.log("tally tests passed");
