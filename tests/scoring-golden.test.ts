import assert from "node:assert/strict";
import test from "node:test";

import { calculatePoints } from "../src/scoring/index.ts";

test("calculatePoints matches representative ron payments", () => {
  const cases = [
    { name: "child 1 han 30 fu", seatWind: "2z" as const, han: 1, fu: 30, ron: 1000 },
    { name: "child 2 han 30 fu", seatWind: "2z" as const, han: 2, fu: 30, ron: 2000 },
    { name: "child 3 han 40 fu", seatWind: "2z" as const, han: 3, fu: 40, ron: 5200 },
    { name: "child mangan", seatWind: "2z" as const, han: 5, fu: 30, ron: 8000 },
    { name: "dealer 2 han 30 fu", seatWind: "1z" as const, han: 2, fu: 30, ron: 2900 },
    { name: "dealer mangan", seatWind: "1z" as const, han: 5, fu: 30, ron: 12000 },
  ];

  for (const item of cases) {
    const points = calculatePoints({
      hand: [],
      winningTile: "1m",
      method: "ron",
      seatWind: item.seatWind,
    }, item.han, item.fu);

    assert.equal(points.ron, item.ron, item.name);
  }
});

test("calculatePoints matches representative tsumo payments", () => {
  const child = calculatePoints({
    hand: [],
    winningTile: "1m",
    method: "tsumo",
    seatWind: "2z",
  }, 3, 20);
  assert.deepEqual(child.tsumo, { dealer: 1300, nonDealer: 700 });
  assert.equal(child.total, 2700);

  const dealer = calculatePoints({
    hand: [],
    winningTile: "1m",
    method: "tsumo",
    seatWind: "1z",
  }, 3, 20);
  assert.deepEqual(dealer.tsumo, { dealer: 1300, nonDealer: 1300 });
  assert.equal(dealer.total, 3900);
});

test("calculatePoints matches limit hands", () => {
  assert.equal(calculatePoints({ hand: [], winningTile: "1m", method: "ron", seatWind: "2z" }, 6, 30).ron, 12000);
  assert.equal(calculatePoints({ hand: [], winningTile: "1m", method: "ron", seatWind: "2z" }, 8, 30).ron, 16000);
  assert.equal(calculatePoints({ hand: [], winningTile: "1m", method: "ron", seatWind: "2z" }, 11, 30).ron, 24000);
  assert.equal(calculatePoints({ hand: [], winningTile: "1m", method: "ron", seatWind: "2z" }, 13, 30).ron, 32000);
  assert.equal(calculatePoints({ hand: [], winningTile: "1m", method: "ron", seatWind: "2z" }, 0, 0, 2).ron, 64000);
});
