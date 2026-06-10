import assert from "node:assert/strict";
import test from "node:test";

import { parseTileGroups } from "../src/core/tile.ts";
import {
  calculateAgariScore,
  calculateFu,
  decomposeAgari,
  evaluateYaku,
  type AgariContext,
} from "../src/scoring/index.ts";

test("decomposeAgari returns standard sequence decompositions with wait type", () => {
  const hand = parseTileGroups("123m456m789p234s22z");
  const decompositions = decomposeAgari(hand, "4s");

  assert.ok(decompositions.some((item) => (
    item.kind === "standard"
    && item.pair === "2z"
    && item.wait === "ryanmen"
    && item.melds.length === 4
  )));
});

test("decomposeAgari handles chiitoi and kokushi", () => {
  const chiitoi = decomposeAgari(parseTileGroups("11223344556677m"), "7m");
  const kokushi = decomposeAgari(parseTileGroups("119m19p19s1234567z"), "1m");

  assert.ok(chiitoi.some((item) => item.kind === "chiitoi" && item.wait === "tanki"));
  assert.ok(kokushi.some((item) => item.kind === "kokushi" && item.wait === "kokushi_13"));
});

test("evaluateYaku detects pinfu, riichi and menzen tsumo", () => {
  const context: AgariContext = {
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "tsumo",
    seatWind: "3z",
    bakaze: "1z",
    riichi: true,
  };
  const decomposition = decomposeAgari(context.hand, context.winningTile)
    .find((item) => item.wait === "ryanmen");
  assert.ok(decomposition);
  const yaku = evaluateYaku(context, decomposition).map((item) => item.id);

  assert.ok(yaku.includes("pinfu"));
  assert.ok(yaku.includes("riichi"));
  assert.ok(yaku.includes("menzen_tsumo"));
});

test("calculateFu handles pinfu and yakuhai triplet shapes", () => {
  const pinfuContext: AgariContext = {
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
  };
  const pinfu = decomposeAgari(pinfuContext.hand, pinfuContext.winningTile)
    .find((item) => item.wait === "ryanmen");
  assert.ok(pinfu);
  assert.equal(calculateFu(pinfuContext, pinfu), 30);

  const yakuhaiContext: AgariContext = {
    hand: parseTileGroups("111z123m456p789s22z"),
    winningTile: "1z",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
  };
  const yakuhai = decomposeAgari(yakuhaiContext.hand, yakuhaiContext.winningTile)
    .find((item) => item.wait === "shanpon");
  assert.ok(yakuhai);
  assert.equal(calculateFu(yakuhaiContext, yakuhai), 40);
});

test("calculateAgariScore picks the highest scoring valid candidate", () => {
  const result = calculateAgariScore({
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    riichi: true,
  });

  assert.ok(result.best);
  assert.equal(result.status, "scored");
  assert.ok(result.decompositions.length > 0);
  assert.equal(result.best.han, 2);
  assert.equal(result.best.fu, 30);
  assert.equal(result.best.points.ron, 2000);
  assert.deepEqual(result.best.yaku.map((item) => item.id).sort(), ["pinfu", "riichi"]);
});

test("calculateAgariScore distinguishes not-agari from no-yaku", () => {
  const notAgari = calculateAgariScore({
    hand: parseTileGroups("123m456p789s12345z"),
    winningTile: "5z",
    method: "ron",
    seatWind: "1z",
    bakaze: "2z",
  });
  assert.equal(notAgari.status, "not_agari");
  assert.equal(notAgari.decompositions.length, 0);
  assert.equal(notAgari.candidates.length, 0);
  assert.equal(notAgari.best, undefined);

  const noYaku = calculateAgariScore({
    hand: parseTileGroups("123m456p789s222m55p"),
    winningTile: "2m",
    method: "ron",
    seatWind: "1z",
    bakaze: "2z",
  });
  assert.equal(noYaku.status, "no_yaku");
  assert.ok(noYaku.decompositions.length > 0);
  assert.equal(noYaku.candidates.length, 0);
  assert.equal(noYaku.best, undefined);
});

test("calculateAgariScore reports invalid context warnings", () => {
  const result = calculateAgariScore({
    hand: parseTileGroups("123m456p789s22z"),
    winningTile: "3m",
    method: "ron",
    seatWind: "3z",
    bakaze: "4z",
    riichi: true,
    calls: [{ type: "minkan", tiles: ["1z", "1z", "1z", "1z"], calledTile: "1z" }],
  });

  assert.equal(result.status, "invalid_context");
  assert.equal(result.warnings[0].code, "riichi_open_hand");
  assert.equal(result.warnings[0].severity, "error");
  assert.equal(result.candidates.length, 0);
});

test("calculateAgariScore counts aka and ura dora with warnings", () => {
  const result = calculateAgariScore({
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    riichi: true,
    doraIndicators: ["1z"],
    uraDoraIndicators: ["1s"],
    akaDoraCount: 1,
  });

  assert.equal(result.status, "scored");
  assert.ok(result.best?.yaku.some((item) => item.id === "dora" && item.han === 2));
  assert.ok(result.best?.yaku.some((item) => item.id === "ura_dora" && item.han === 1));
  assert.ok(result.best?.yaku.some((item) => item.id === "aka_dora" && item.han === 1));
  assert.equal(result.best?.han, 6);

  const ignored = calculateAgariScore({
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    riichi: true,
    akaDoraCount: 1,
    rules: {
      akaDora: false,
      kuitan: true,
      doubleRon: true,
      countDoubleYakuman: false,
    },
  });
  assert.ok(ignored.warnings.some((item) => item.code === "aka_dora_disabled"));
  assert.equal(ignored.best?.yaku.some((item) => item.id === "aka_dora"), false);

  const uraWithoutRiichi = calculateAgariScore({
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    uraDoraIndicators: ["1s"],
  });
  assert.ok(uraWithoutRiichi.warnings.some((item) => item.code === "ura_dora_without_riichi"));
  assert.equal(uraWithoutRiichi.best?.yaku.some((item) => item.id === "ura_dora"), false);
});

test("calculateAgariScore scores kokushi as yakuman", () => {
  const result = calculateAgariScore({
    hand: parseTileGroups("119m19p19s1234567z"),
    winningTile: "1m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  });

  assert.ok(result.best);
  assert.equal(result.best.yaku[0].id, "kokushi");
  assert.equal(result.best.points.limit, "yakuman");
  assert.equal(result.best.points.ron, 32000);
});

test("evaluateYaku detects common sequence yaku", () => {
  const sanshoku = calculateAgariScore({
    hand: parseTileGroups("123m123p123s456m55z"),
    winningTile: "3s",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(sanshoku?.yaku.some((item) => item.id === "sanshoku_doujun" && item.han === 2));

  const ittsu = calculateAgariScore({
    hand: parseTileGroups("123456789m123p55z"),
    winningTile: "9m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(ittsu?.yaku.some((item) => item.id === "ittsu" && item.han === 2));
});

test("evaluateYaku detects chanta, junchan, honroutou and ryanpeikou", () => {
  const chanta = calculateAgariScore({
    hand: parseTileGroups("123m789m111p999s55z"),
    winningTile: "3m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(chanta?.yaku.some((item) => item.id === "chanta" && item.han === 2));

  const junchan = calculateAgariScore({
    hand: parseTileGroups("123m789m111p999s11m"),
    winningTile: "3m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(junchan?.yaku.some((item) => item.id === "junchan" && item.han === 3));

  const honroutou = calculateAgariScore({
    hand: parseTileGroups("111m999m111p999p55z"),
    winningTile: "1m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(honroutou?.yaku.some((item) => item.id === "honroutou"));

  const ryanpeikou = calculateAgariScore({
    hand: parseTileGroups("112233m112233p55s"),
    winningTile: "3p",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(ryanpeikou?.yaku.some((item) => item.id === "ryanpeikou"));
  assert.equal(ryanpeikou?.yaku.some((item) => item.id === "iipeikou"), false);
});

test("evaluateYaku detects triplet yaku", () => {
  const sanankou = calculateAgariScore({
    hand: parseTileGroups("111m222p333s456m55z"),
    winningTile: "6m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(sanankou?.yaku.some((item) => item.id === "sanankou"));

  const shousangen = calculateAgariScore({
    hand: parseTileGroups("555z666z123m789p77z"),
    winningTile: "7z",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(shousangen?.yaku.some((item) => item.id === "shousangen"));

  const sanshokuDoukou = calculateAgariScore({
    hand: parseTileGroups("111m111p111s234m55z"),
    winningTile: "4m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    riichi: true,
  }).best;
  assert.ok(sanshokuDoukou?.yaku.some((item) => item.id === "sanshoku_doukou"));
});

test("evaluateYaku detects double riichi and kan-related yaku", () => {
  const doubleRiichi = calculateAgariScore({
    hand: parseTileGroups("123m456m789p234s22z"),
    winningTile: "4s",
    method: "ron",
    seatWind: "3z",
    bakaze: "1z",
    doubleRiichi: true,
  }).best;
  assert.ok(doubleRiichi?.yaku.some((item) => item.id === "double_riichi" && item.han === 2));
  assert.equal(doubleRiichi?.yaku.some((item) => item.id === "riichi"), false);

  const sankantsu = calculateAgariScore({
    hand: parseTileGroups("123m55z"),
    winningTile: "3m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    calls: [
      { type: "minkan", tiles: ["1p", "1p", "1p", "1p"] },
      { type: "minkan", tiles: ["2p", "2p", "2p", "2p"] },
      { type: "minkan", tiles: ["3p", "3p", "3p", "3p"] },
    ],
  }).best;
  assert.ok(sankantsu?.yaku.some((item) => item.id === "sankantsu"));
});

test("evaluateYaku detects initial yakuman set", () => {
  const daisangen = calculateAgariScore({
    hand: parseTileGroups("555z666z777z123m11m"),
    winningTile: "1m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.equal(daisangen?.yaku[0].id, "daisangen");
  assert.equal(daisangen?.points.ron, 32000);

  const suuankou = calculateAgariScore({
    hand: parseTileGroups("111m222p333s444z55z"),
    winningTile: "5z",
    method: "tsumo",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(suuankou?.yaku.some((item) => item.id === "suuankou"));

  const tsuuiisou = calculateAgariScore({
    hand: parseTileGroups("111z222z333z555z77z"),
    winningTile: "7z",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(tsuuiisou?.yaku.some((item) => item.id === "tsuuiisou"));

  const chinroutou = calculateAgariScore({
    hand: parseTileGroups("111m999m111p999p11s"),
    winningTile: "1s",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(chinroutou?.yaku.some((item) => item.id === "chinroutou"));

  const shousuushii = calculateAgariScore({
    hand: parseTileGroups("111z222z333z123m44z"),
    winningTile: "4z",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(shousuushii?.yaku.some((item) => item.id === "shousuushii"));

  const daisuuushii = calculateAgariScore({
    hand: parseTileGroups("111z222z333z444z55z"),
    winningTile: "5z",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(daisuuushii?.yaku.some((item) => item.id === "daisuushii" && item.yakuman === 1));

  const ryuuiisou = calculateAgariScore({
    hand: parseTileGroups("22233344466688s"),
    winningTile: "8s",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(ryuuiisou?.yaku.some((item) => item.id === "ryuuiisou"));

  const suukantsu = calculateAgariScore({
    hand: parseTileGroups("55z"),
    winningTile: "5z",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    calls: [
      { type: "minkan", tiles: ["1m", "1m", "1m", "1m"] },
      { type: "minkan", tiles: ["9m", "9m", "9m", "9m"] },
      { type: "minkan", tiles: ["1p", "1p", "1p", "1p"] },
      { type: "minkan", tiles: ["9p", "9p", "9p", "9p"] },
    ],
  }).best;
  assert.ok(suukantsu?.yaku.some((item) => item.id === "suukantsu"));

  const chuuren = calculateAgariScore({
    hand: parseTileGroups("11123456789999m"),
    winningTile: "9m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
  }).best;
  assert.ok(chuuren?.yaku.some((item) => item.id === "chuuren_poutou" && item.yakuman === 1));
});

test("evaluateYaku supports context yakuman and optional double yakuman", () => {
  const tenhou = calculateAgariScore({
    hand: parseTileGroups("11223344556677m"),
    winningTile: "7m",
    method: "tsumo",
    seatWind: "1z",
    bakaze: "1z",
    tenhou: true,
  }).best;
  assert.deepEqual(tenhou?.yaku.map((item) => item.id), ["tenhou"]);

  const doubleKokushi = calculateAgariScore({
    hand: parseTileGroups("119m19p19s1234567z"),
    winningTile: "1m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    rules: {
      akaDora: true,
      kuitan: true,
      doubleRon: true,
      countDoubleYakuman: true,
    },
  }).best;
  assert.equal(doubleKokushi?.yaku[0].yakuman, 2);
  assert.equal(doubleKokushi?.points.ron, 64000);

  const doubleSuuankou = calculateAgariScore({
    hand: parseTileGroups("111m222p333s444z55z"),
    winningTile: "5z",
    method: "tsumo",
    seatWind: "2z",
    bakaze: "1z",
    rules: {
      akaDora: true,
      kuitan: true,
      doubleRon: true,
      countDoubleYakuman: true,
    },
  }).best;
  assert.ok(doubleSuuankou?.yaku.some((item) => item.id === "suuankou" && item.yakuman === 2));

  const doubleDaisuushii = calculateAgariScore({
    hand: parseTileGroups("111z222z333z444z55z"),
    winningTile: "5z",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    rules: {
      akaDora: true,
      kuitan: true,
      doubleRon: true,
      countDoubleYakuman: true,
    },
  }).best;
  assert.ok(doubleDaisuushii?.yaku.some((item) => item.id === "daisuushii" && item.yakuman === 2));

  const doubleChuuren = calculateAgariScore({
    hand: parseTileGroups("11123456789999m"),
    winningTile: "9m",
    method: "ron",
    seatWind: "2z",
    bakaze: "1z",
    rules: {
      akaDora: true,
      kuitan: true,
      doubleRon: true,
      countDoubleYakuman: true,
    },
  }).best;
  assert.ok(doubleChuuren?.yaku.some((item) => item.id === "chuuren_poutou" && item.yakuman === 2));
});
