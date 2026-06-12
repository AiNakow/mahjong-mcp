import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import type { DiscardCandidate } from "../service/analyze.ts";
import type { ProbabilityEstimate } from "./types.ts";
import { clampProbability, estimateRemainingOwnDraws, estimateUnknownWallSize, nextDoraTile } from "./wall-model.ts";

export interface WinRateInput {
  state: GameState;
  candidate: DiscardCandidate;
  remainingDraws?: number;
  unknownWallSize?: number;
}

export function estimateWinRateFast(input: WinRateInput): ProbabilityEstimate {
  const remainingDraws = input.remainingDraws ?? estimateRemainingOwnDraws(input.state);
  const unknownWallSize = input.unknownWallSize ?? estimateUnknownWallSize(input.state);
  const candidate = input.candidate;
  const effectiveWaits = estimateEffectiveWaits(input.state, candidate);
  const reasons: string[] = [
    `剩余自摸约 ${remainingDraws} 巡。`,
    `有效枚数按真实剩余枚数、待牌种类、宝牌和形状折算为 ${effectiveWaits.toFixed(2)}。`,
  ];

  let value: number;
  if (candidate.shanten <= 0) {
    const turnCount = remainingDraws * (input.state.self.riichi ? 1.22 : 1.55);
    value = 1 - Math.pow(1 - safeRate(effectiveWaits, unknownWallSize), turnCount);
  } else if (candidate.shanten === 1) {
    const tenpaiRate = 1 - Math.pow(1 - safeRate(candidate.totalWaits, unknownWallSize), remainingDraws);
    const futureWaitQuality = candidate.totalWaits > 0
      ? 0.72 + Math.min(0.28, candidate.goodShapeCount / candidate.totalWaits * 0.28)
      : 0.55;
    value = tenpaiRate * futureWaitQuality * 0.62;
    reasons.push(`一向听先按 ${candidate.totalWaits} 枚进张估算听牌率，再用好形率修正后续和牌。`);
  } else if (candidate.shanten === 2) {
    const improveRate = 1 - Math.pow(1 - safeRate(candidate.totalWaits, unknownWallSize), remainingDraws);
    value = improveRate * 0.23;
    reasons.push("二向听使用进张进入更近向听后的折算和率。");
  } else {
    value = Math.min(0.035, candidate.totalWaits / unknownWallSize * 0.06);
    reasons.push("三向听以上仅给低精度快速估算。");
  }

  if (hasActiveThreat(input.state)) {
    value *= 0.86;
    reasons.push("存在立直或两副露威胁，推进中断概率下调和牌率。");
  }

  return {
    value: clampProbability(value),
    confidence: candidate.shanten <= 1 ? "medium" : "low",
    reasons,
  };
}

export function estimateEffectiveWaits(state: GameState, candidate: DiscardCandidate): number {
  const doraTiles = state.doraIndicators.map(nextDoraTile);
  const waits = candidate.waits.length > 0
    ? candidate.waits
    : [{ id: candidate.discard, remaining: Math.max(0, 4 - countInHandAfterDiscard(state, candidate.discard)) }];
  const shapeWeight = getShapeWeight(candidate);
  return waits.reduce((total, wait) => (
    total + wait.remaining * getTileWinWeight(wait.id, state, doraTiles) * shapeWeight
  ), 0);
}

function getShapeWeight(candidate: DiscardCandidate): number {
  if (candidate.shanten > 0) {
    return 1;
  }
  if (candidate.waits.length >= 3) {
    return 1.2;
  }
  if (candidate.waits.length === 2) {
    return candidate.totalWaits <= 4 ? 0.92 : 1.02;
  }
  return 0.78;
}

function getTileWinWeight(tile: TileId, state: GameState, doraTiles: readonly TileId[]): number {
  let weight = 1;
  if (tile[1] === "z") {
    const visible = state.visibleTiles[27 + Number(tile[0]) - 1] ?? 0;
    weight = visible >= 2 ? 1.34 : visible === 1 ? 1.16 : 1.08;
    if (state.round.turn >= 13 && visible === 0) {
      weight -= 0.18;
    }
  } else {
    const rank = Number(tile[0]);
    if (rank === 1 || rank === 9) {
      weight = 1.1;
    } else if (rank === 2 || rank === 8) {
      weight = 1;
    } else if (rank === 3 || rank === 7) {
      weight = 0.9;
    } else if (rank === 4 || rank === 6) {
      weight = 0.84;
    } else {
      weight = 0.76;
    }
  }
  if (doraTiles.includes(tile)) {
    weight *= 0.48;
  } else if (isDoraSide(tile, doraTiles)) {
    weight *= 0.72;
  }
  if (isOwnRiverSuji(tile, state)) {
    weight += tile[1] === "z" ? 0 : getOwnRiverSujiBonus(Number(tile[0]));
  }
  return Math.max(0.25, weight);
}

function safeRate(count: number, wallSize: number): number {
  return Math.max(0, Math.min(0.8, count / Math.max(1, wallSize)));
}

function countInHandAfterDiscard(state: GameState, discard: TileId): number {
  const hand = [...(state.self.hand ?? []), ...(state.lastDraw ? [state.lastDraw] : [])];
  const index = hand.indexOf(discard);
  if (index >= 0) {
    hand.splice(index, 1);
  }
  return hand.filter((tile) => tile === discard).length;
}

function hasActiveThreat(state: GameState): boolean {
  return state.opponents.some((opponent) => opponent.riichi || opponent.calls.length >= 2);
}

function isDoraSide(tile: TileId, doraTiles: readonly TileId[]): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  return doraTiles.some((dora) => dora[1] === tile[1] && Math.abs(Number(dora[0]) - rank) === 1);
}

function isOwnRiverSuji(tile: TileId, state: GameState): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  const anchors = [rank - 3, rank + 3]
    .filter((item) => item >= 1 && item <= 9)
    .map((item) => `${item}${tile[1]}` as TileId);
  return state.self.discards.some((discard) => anchors.includes(discard.tile));
}

function getOwnRiverSujiBonus(rank: number): number {
  if (rank === 1 || rank === 9) {
    return 0.2;
  }
  if (rank === 2 || rank === 8) {
    return 0.14;
  }
  if (rank === 3 || rank === 7) {
    return 0.08;
  }
  return 0.03;
}
