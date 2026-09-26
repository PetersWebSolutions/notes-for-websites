"use strict";

const assert = require("assert");
const Tally = require("./tally.js");

assert.strictEqual(Tally.MAX_PEOPLE, 300);
assert.deepStrictEqual(Tally.SIZES, ["S", "M", "L", "XL", "2XL", "3XL", "4XL"]);
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

/* normalizeColor keeps the size/qty pair in sync: no size means no shirts. */
assert.deepStrictEqual(Tally.normalizeColor({ size: "L", qty: 2 }), { size: "L", qty: 2 });
assert.deepStrictEqual(Tally.normalizeColor({ size: "", qty: 4 }), { size: "", qty: 0 });
assert.deepStrictEqual(Tally.normalizeColor({ size: "5XL", qty: 1 }), { size: "", qty: 0 });
assert.deepStrictEqual(Tally.normalizeColor(null), { size: "", qty: 0 });

const ana = {
  id: "1",
  name: "Ana Reyes",
  white: { size: "M", qty: 2 },
  blue: { size: "2XL", qty: 1 },
  xl3: 1,
  xl4: 0,
  paid: true
};
const ben = {
  id: "2",
  name: "Ben Cruz",
  white: { size: "", qty: 0 },
  blue: { size: "4XL", qty: 1 },
  xl3: 0,
  xl4: 2,
  paid: false
};

assert.strictEqual(Tally.isPerson(ana), true);
assert.strictEqual(Tally.isPerson({ ...ana, name: "" }), false);
assert.strictEqual(Tally.isPerson({ ...ana, paid: "yes" }), false);
assert.strictEqual(Tally.isPerson({ id: "", name: "Ana", white: {}, blue: {}, paid: true }), false);

/* One person can order both colors, each with its own quantity. */
assert.strictEqual(Tally.personShirts(ana), 2 + 1 + 1);
assert.strictEqual(Tally.personPrice(ana), 2 * 399 + 449 + 449);
assert.strictEqual(Tally.personShirts(ben), 1 + 2);
assert.strictEqual(Tally.personPrice(ben), 449 + 2 * 449);

const summary = Tally.summarize([ana, ben]);
assert.strictEqual(summary.count, 2);
assert.strictEqual(summary.shirts, 7);
assert.strictEqual(summary.total, 2 * 399 + 449 + 449 + 3 * 449);
assert.strictEqual(summary.paid, 2 * 399 + 449 + 449);
assert.strictEqual(summary.unpaid, 3 * 449);
assert.strictEqual(summary.paidCount, 1);
assert.strictEqual(summary.unpaidCount, 1);
assert.strictEqual(summary.colorCount.white, 2);
assert.strictEqual(summary.colorCount.blue, 2);
assert.strictEqual(summary.colorCount.extra, 3);
assert.strictEqual(summary.colorAmount.white, 2 * 399);
assert.strictEqual(summary.colorAmount.blue, 449 + 449);
assert.strictEqual(summary.colorAmount.extra, 3 * 449);
assert.strictEqual(summary.grid.white.M, 2);
assert.strictEqual(summary.grid.blue["2XL"], 1);
assert.strictEqual(summary.grid.blue["4XL"], 1);
assert.strictEqual(summary.extras["3XL"], 1);
assert.strictEqual(summary.extras["4XL"], 2);
assert.strictEqual(summary.sizeCount["3XL"], 1);
assert.strictEqual(summary.sizeCount["4XL"], 3);
assert.strictEqual(summary.sizeAmount.M, 2 * 399);
assert.strictEqual(summary.sizeAmount["4XL"], 3 * 449);

const empty = Tally.summarize([]);
assert.strictEqual(empty.count, 0);
assert.strictEqual(empty.shirts, 0);
assert.strictEqual(empty.total, 0);
assert.strictEqual(empty.paid, 0);
assert.strictEqual(empty.unpaid, 0);
assert.strictEqual(empty.colorCount.white, 0);
assert.strictEqual(empty.colorCount.blue, 0);
assert.strictEqual(empty.colorCount.extra, 0);

const dirty = Tally.summarize([ana, { id: "x", name: "", white: {}, blue: {}, paid: true }]);
assert.strictEqual(dirty.count, 1);
assert.strictEqual(dirty.total, Tally.personPrice(ana));

const normalized = Tally.normalizePerson({
  id: "9",
  name: "  Cara  Lim ",
  white: { size: "S", qty: 150 },
  blue: { size: "", qty: 7 },
  xl3: "3",
  xl4: -1,
  paid: "yes"
});
assert.deepStrictEqual(normalized, {
  id: "9",
  name: "Cara Lim",
  white: { size: "S", qty: 99 },
  blue: { size: "", qty: 0 },
  xl3: 3,
  xl4: 0,
  paid: false,
  createdAt: 0
});
assert.strictEqual(Tally.normalizePerson({ name: "No id", paid: true }), null);
assert.strictEqual(Tally.normalizePerson({ name: "No id", paid: true }, () => "made-1").id, "made-1");
assert.strictEqual(Tally.normalizePerson(null), null);

/* Old one-shirt-per-row data migrates to a person row. */
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
  white: { size: "", qty: 0 },
  blue: { size: "2XL", qty: 1 },
  xl3: 0,
  xl4: 0,
  paid: true,
  createdAt: 123
});
assert.strictEqual(Tally.migrateLegacyOrder({ id: "o", name: "Eve", size: "5XL", color: "white", paid: false }), null);
assert.strictEqual(Tally.migrateLegacyOrder({ id: "o", name: "Eve", size: "S", color: "red", paid: false }), null);
assert.strictEqual(Tally.migrateLegacyOrder(null), null);

assert.strictEqual(Tally.peopleLabel(1), "1 person");
assert.strictEqual(Tally.peopleLabel(0), "0 people");
assert.strictEqual(Tally.shirtsLabel(1), "1 shirt");
assert.strictEqual(Tally.shirtsLabel(3), "3 shirts");
assert.ok(Tally.priceLegend().includes("₱399"));
assert.ok(Tally.priceLegend().includes("₱449"));

console.log("tally tests passed");
