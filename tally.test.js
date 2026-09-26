"use strict";

const assert = require("assert");
const Tally = require("./tally.js");

assert.strictEqual(Tally.MAX_PEOPLE, 300);
assert.deepStrictEqual(Tally.SIZES, ["S", "M", "L", "XL", "2XL"]);
assert.strictEqual(Tally.PRICES.S, 399);
assert.strictEqual(Tally.PRICES.M, 399);
assert.strictEqual(Tally.PRICES.L, 399);
assert.strictEqual(Tally.PRICES.XL, 399);
assert.strictEqual(Tally.PRICES["2XL"], 449);
assert.strictEqual(Tally.priceFor("M"), 399);
assert.strictEqual(Tally.priceFor("2XL"), 449);
assert.strictEqual(Tally.priceFor("3XL"), null);
assert.strictEqual(Tally.formatPesos(399), "₱399");
assert.strictEqual(Tally.formatPesos(8526), "₱8,526");
assert.strictEqual(Tally.cleanName("  Juan   dela Cruz  "), "Juan dela Cruz");
assert.strictEqual(Tally.cleanName("José\u0000 Niño"), "José Niño");
assert.strictEqual(Tally.isValidName("Ma. Clara"), true);
assert.strictEqual(Tally.isValidName("..."), false);
assert.strictEqual(Tally.isValidName(""), false);

const orders = [
  { id: "1", name: "Ana Reyes", size: "S", color: "white", paid: true },
  { id: "2", name: "Ben Cruz", size: "2XL", color: "blue", paid: false },
  { id: "3", name: "Cara Lim", size: "L", color: "white", paid: false },
  { id: "4", name: "Dan Uy", size: "XL", color: "blue", paid: true }
];

assert.strictEqual(Tally.isOrder(orders[1]), true);
assert.strictEqual(Tally.isOrder({ ...orders[0], size: "XXXL" }), false);
assert.strictEqual(Tally.isOrder({ ...orders[0], color: "red" }), false);
assert.strictEqual(Tally.isOrder({ ...orders[0], paid: "yes" }), false);

const summary = Tally.summarize(orders);
assert.strictEqual(summary.count, 4);
assert.strictEqual(summary.total, 399 + 449 + 399 + 399);
assert.strictEqual(summary.paid, 399 + 399);
assert.strictEqual(summary.unpaid, 449 + 399);
assert.strictEqual(summary.paidCount, 2);
assert.strictEqual(summary.unpaidCount, 2);
assert.strictEqual(summary.colorCount.white, 2);
assert.strictEqual(summary.colorCount.blue, 2);
assert.strictEqual(summary.colorAmount.blue, 449 + 399);
assert.strictEqual(summary.colorAmount.white, 399 + 399);
assert.strictEqual(summary.grid.blue["2XL"], 1);
assert.strictEqual(summary.grid.white.L, 1);
assert.strictEqual(summary.sizeCount.XL, 1);
assert.strictEqual(summary.sizeAmount["2XL"], 449);

const empty = Tally.summarize([]);
assert.strictEqual(empty.total, 0);
assert.strictEqual(empty.paid, 0);
assert.strictEqual(empty.unpaid, 0);
assert.strictEqual(empty.colorCount.white, 0);
assert.strictEqual(empty.colorCount.blue, 0);

const dirty = Tally.summarize([orders[0], { id: "x", name: "", size: "S", color: "white", paid: true }]);
assert.strictEqual(dirty.count, 1);
assert.strictEqual(dirty.total, 399);

assert.strictEqual(Tally.peopleLabel(1), "1 person");
assert.strictEqual(Tally.peopleLabel(0), "0 people");
assert.ok(Tally.priceLegend().includes("₱399"));
assert.ok(Tally.priceLegend().includes("₱449"));

console.log("tally tests passed");
