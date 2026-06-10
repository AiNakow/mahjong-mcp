import assert from "node:assert/strict";
import test from "node:test";

import { scoreHand } from "../src/service/score-hand.ts";

test("scoreHand scores a structured ron request", () => {
  const result = scoreHand({
    text: "123m456m789p234s22z",
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    riichi: true,
  });

  assert.equal(result.handText, "123m456m789p234s22z");
  assert.equal(result.status, "scored");
  assert.deepEqual(result.warnings, []);
  assert.equal(result.decompositions, undefined);
  assert.equal(result.candidates, undefined);
  assert.equal(result.raw, undefined);
  assert.equal(result.best?.han, 2);
  assert.equal(result.best?.fu, 30);
  assert.equal(result.best?.points.ron, 2000);
  assert.deepEqual(result.best?.yaku.map((item) => item.id).sort(), ["pinfu", "riichi"]);
});

test("scoreHand supports honba, riichi sticks and dora indicators", () => {
  const result = scoreHand({
    text: "123m456m789p234s22z",
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    riichi: true,
    honba: 1,
    riichiSticks: 1,
    doraIndicators: ["1z"],
    akaDoraCount: 1,
    uraDoraIndicators: ["1s"],
  });

  assert.ok(result.best?.yaku.some((item) => item.id === "dora" && item.han === 2));
  assert.ok(result.best?.yaku.some((item) => item.id === "aka_dora" && item.han === 1));
  assert.ok(result.best?.yaku.some((item) => item.id === "ura_dora" && item.han === 1));
  assert.equal(result.best?.han, 6);
  assert.equal(result.best?.points.ron, 12300);
  assert.equal(result.best?.points.total, 13300);
});

test("scoreHand exposes no-yaku status", () => {
  const result = scoreHand({
    text: "123m456p789s222m55p",
    winningTile: "2m",
    method: "ron",
    seatWind: "1z",
    bakaze: "2z",
    verbose: true,
  });

  assert.equal(result.status, "no_yaku");
  assert.ok(result.decompositions && result.decompositions.length > 0);
  assert.equal(result.candidates?.length, 0);
  assert.ok(result.raw);
  assert.equal(result.best, undefined);
});

test("scoreHand supports open yakuhai and open tanyao rules", () => {
  const yakuhai = scoreHand({
    text: "123m456p789s77s",
    winningTile: "3m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    calls: [{ type: "pon", tiles: ["5z", "5z", "5z"], calledTile: "5z" }],
  });
  assert.equal(yakuhai.status, "scored");
  assert.ok(yakuhai.best?.yaku.some((item) => item.id === "yakuhai_haku"));

  const openTanyao = scoreHand({
    text: "234p345s456s66p",
    winningTile: "6s",
    method: "ron",
    seatWind: "1z",
    bakaze: "2z",
    calls: [{ type: "chi", tiles: ["2m", "3m", "4m"], calledTile: "3m" }],
  });
  assert.equal(openTanyao.status, "scored");
  assert.ok(openTanyao.best?.yaku.some((item) => item.id === "tanyao"));

  const noKuitan = scoreHand({
    text: "234p345s456s66p",
    winningTile: "6s",
    method: "ron",
    seatWind: "1z",
    bakaze: "2z",
    calls: [{ type: "chi", tiles: ["2m", "3m", "4m"], calledTile: "3m" }],
    rules: {
      akaDora: true,
      kuitan: false,
      doubleRon: true,
      countDoubleYakuman: false,
    },
  });
  assert.equal(noKuitan.status, "no_yaku");
});

test("scoreHand treats ankan as menzen but minkan as open", () => {
  const ankan = scoreHand({
    text: "123m456p789s22z",
    winningTile: "3m",
    method: "ron",
    seatWind: "3z",
    bakaze: "4z",
    riichi: true,
    calls: [{ type: "ankan", tiles: ["1z", "1z", "1z", "1z"] }],
  });
  assert.equal(ankan.status, "scored");
  assert.ok(ankan.best?.yaku.some((item) => item.id === "riichi"));

  const minkan = scoreHand({
    text: "123m456p789s22z",
    winningTile: "3m",
    method: "ron",
    seatWind: "3z",
    bakaze: "4z",
    riichi: true,
    calls: [{ type: "minkan", tiles: ["1z", "1z", "1z", "1z"], calledTile: "1z" }],
  });
  assert.equal(minkan.status, "invalid_context");
  assert.ok(minkan.warnings.some((item) => item.code === "riichi_open_hand"));
});

test("scoreHand applies open yaku han changes and rejects invalid calls", () => {
  const openSanshoku = scoreHand({
    text: "123p123s456m22z",
    winningTile: "3s",
    method: "ron",
    seatWind: "3z",
    bakaze: "4z",
    calls: [{ type: "chi", tiles: ["1m", "2m", "3m"], calledTile: "2m" }],
  });
  const sanshoku = openSanshoku.best?.yaku.find((item) => item.id === "sanshoku_doujun");
  assert.equal(openSanshoku.status, "scored");
  assert.equal(sanshoku?.han, 1);

  const invalidCall = scoreHand({
    text: "123p123s456m22z",
    winningTile: "3s",
    method: "ron",
    seatWind: "3z",
    bakaze: "4z",
    calls: [{ type: "chi", tiles: ["1m", "3m", "4m"], calledTile: "3m" }],
  });
  assert.equal(invalidCall.status, "not_agari");
});
