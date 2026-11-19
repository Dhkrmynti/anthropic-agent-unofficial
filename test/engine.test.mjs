import test from "node:test";
import assert from "node:assert/strict";
import { apply, START } from "../lib/engine.mjs";

const fresh = () => ({ cash: START, shares: 0, cost: 0, realized: 0, trades: [] });

test("sell all liquidates a position even when it is worth less than $1", () => {
  const bought = apply(fresh(), "buy", 1, 70);
  assert.ok(bought.pf);
  const sold = apply(bought.pf, "sell", "all", 50);
  assert.ok(sold.pf);
  assert.equal(sold.pf.shares, 0);
  assert.equal(sold.pf.cost, 0);
  assert.ok(Math.abs(sold.fill.usd - 50 / 70) < 1e-9);
});

test("partial sale preserves proportional cost basis", () => {
  const bought = apply(fresh(), "buy", 100, 50);
  const sold = apply(bought.pf, "sell", 50, 100);
  assert.equal(sold.pf.shares, 1.5);
  assert.equal(sold.pf.cost, 75);
  assert.equal(sold.pf.realized, 25);
});

test("non-finite order sizes cannot alter a portfolio", () => {
  for (const amount of [Infinity, -Infinity, NaN]) {
    assert.ok(apply(fresh(), "buy", amount, 70).error);
    assert.ok(apply(fresh(), "sell", amount, 70).error);
  }
});
