import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import type { DiscardCandidate } from "../service/analyze.ts";
import type { HandValueDistribution } from "./types.ts";
import { nextDoraTile } from "./wall-model.ts";

export function estimateHandValueFast(state: GameState, candidate: DiscardCandidate): HandValueDistribution {
  const handAfterDiscard = getHandAfterDiscard(state, candidate.discard);
  const doraTiles = state.doraIndicators.map(nextDoraTile);
  const doraCount = countDora(handAfterDiscard, doraTiles);
  const isDealer = state.self.seatWind === "1z";
  const open = state.self.calls.some((call) => call.type !== "ankan");
  const reasons: string[] = [];

  let base = 1000;
  if (candidate.shanten <= 0) {
    base = 1500;
    reasons.push("当前听牌，按可立即和牌的基础打点估算。");
  } else if (candidate.shanten === 1) {
    base = 1300;
    reasons.push("当前一向听，按主要进张后的常见打点估算。");
  } else {
    base = 900;
    reasons.push("当前二向听以上，打点置信度较低。");
  }

  if (isLikelyTanyao(handAfterDiscard, state.self.calls.flatMap((call) => call.tiles))) {
    base += open ? 250 : 500;
    reasons.push("断幺倾向提高基础打点。");
  }
  const yakuhaiPairs = countYakuhaiPairs(handAfterDiscard, state.round.bakaze, state.self.seatWind);
  if (yakuhaiPairs > 0) {
    base += yakuhaiPairs * 650;
    reasons.push(`役牌对子 ${yakuhaiPairs} 组提高和牌打点。`);
  }
  if (!open && candidate.shanten <= 0) {
    base += 900;
    reasons.push("门清听牌保留立直价值。");
  }
  if (doraCount > 0) {
    base *= 1 + doraCount * 0.78;
    reasons.push(`手中宝牌 ${doraCount} 枚显著提高期望得点。`);
  }
  if (isDealer) {
    base *= 1.48;
    reasons.push("自家亲家，得点按亲家收入上调。");
  }

  const roundedRon = roundToHundred(Math.min(24000, base));
  const tsumoGain = roundToHundred(roundedRon * (isDealer ? 1.05 : 1.18));
  const manganRate = doraCount >= 3 ? 0.55 : doraCount === 2 ? 0.28 : doraCount === 1 ? 0.10 : 0.03;
  const limitHandRate = doraCount >= 4 ? 0.18 : doraCount >= 3 ? 0.06 : 0.01;

  return {
    ron: [{ points: roundedRon, probability: 1 }],
    tsumo: [{ gain: tsumoGain, probability: 1 }],
    averageRon: roundedRon,
    averageTsumoGain: tsumoGain,
    manganRate,
    limitHandRate,
    reasons,
  };
}

function getHandAfterDiscard(state: GameState, discard: TileId): TileId[] {
  const hand = [...(state.self.hand ?? []), ...(state.lastDraw ? [state.lastDraw] : [])];
  const index = hand.indexOf(discard);
  if (index >= 0) {
    hand.splice(index, 1);
  }
  return hand;
}

function countDora(tiles: readonly TileId[], doraTiles: readonly TileId[]): number {
  return tiles.filter((tile) => doraTiles.includes(tile)).length;
}

function isLikelyTanyao(tiles: readonly TileId[], callTiles: readonly TileId[]): boolean {
  const allTiles = [...tiles, ...callTiles];
  return allTiles.length > 0 && allTiles.every((tile) => (
    tile[1] !== "z" && Number(tile[0]) >= 2 && Number(tile[0]) <= 8
  ));
}

function countYakuhaiPairs(tiles: readonly TileId[], bakaze: TileId, seatWind: TileId): number {
  const yakuhai = new Set<TileId>([bakaze, seatWind, "5z", "6z", "7z"]);
  let pairs = 0;
  for (const tile of yakuhai) {
    if (tiles.filter((item) => item === tile).length >= 2) {
      pairs += 1;
    }
  }
  return pairs;
}

function roundToHundred(value: number): number {
  return Math.ceil(value / 100) * 100;
}
