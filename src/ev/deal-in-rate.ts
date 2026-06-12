import type { GameState, PlayerState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import type { DealInEstimate, ProbabilityEstimate } from "./types.ts";
import { clampProbability, nextDoraTile } from "./wall-model.ts";

export function estimateDealInRateFast(
  state: GameState,
  discard: TileId,
  options: { shanten: number; remainingDraws?: number } = { shanten: 1 },
): DealInEstimate {
  const threats = state.opponents.filter(isThreateningOpponent);
  const reasons: string[] = [];
  if (threats.length === 0) {
    reasons.push("当前没有立直或两副露以上威胁，即时放铳率按低值估算。");
  }
  const dangers = threats.map((opponent) => estimateDangerToOpponent(state, opponent, discard));
  const immediate = clampProbability(1 - dangers.reduce((survive, danger) => survive * (1 - danger), 1));
  const remainingDraws = options.remainingDraws ?? Math.max(0, Math.ceil((18 - state.round.turn) * 0.75));
  const futureBase = options.shanten <= 0 ? 0.010 : options.shanten === 1 ? 0.007 : 0.003;
  const futurePush = clampProbability((1 - immediate) * futureBase * remainingDraws * (threats.length || 1));
  const safeTileReserve = countSharedSafeTiles(state);
  const foldFactor = safeTileReserve >= 4 ? 0.25 : safeTileReserve >= 2 ? 0.45 : 0.72;
  const futureFold = clampProbability(futurePush * foldFactor);

  return {
    immediateRate: {
      value: immediate,
      confidence: threats.length > 0 ? "medium" : "low",
      reasons: [...reasons, `即时危险按 ${threats.length} 家威胁独立合成。`],
    },
    futurePushRate: {
      value: futurePush,
      confidence: "low",
      reasons: [`后续推进按剩余 ${remainingDraws} 巡和当前向听折算。`],
    },
    futureFoldRate: {
      value: futureFold,
      confidence: "low",
      reasons: [`后续转防守按共通安牌 ${safeTileReserve} 张修正。`],
    },
    combinedPushRate: {
      value: clampProbability(immediate + futurePush),
      confidence: threats.length > 0 ? "medium" : "low",
      reasons: ["总放铳率 = 即时放铳 + 存活后的后续推进放铳。"],
    },
  };
}

export function estimateDangerToOpponent(state: GameState, opponent: PlayerState, tile: TileId): number {
  const discards = opponent.discards.map((discard) => discard.tile);
  if (discards.includes(tile)) {
    return opponent.riichi ? 0.002 : 0.004;
  }

  let danger = opponent.riichi ? 0.078 : 0.038;
  if (tile[1] === "z") {
    const visible = getVisibleCount(state, tile);
    danger *= visible >= 3 ? 0.18 : visible >= 2 ? 0.45 : 0.82;
  } else {
    const rank = Number(tile[0]);
    if (rank === 1 || rank === 9) {
      danger *= 0.72;
    }
    if (isSuji(tile, discards)) {
      danger *= getSujiFactor(rank);
    } else {
      danger *= getUnsujiFactor(rank);
      danger *= getSujiCompressionFactor(state, opponent, tile);
    }
    if (hasWallSupport(state, tile)) {
      danger *= 0.58;
    }
  }

  const doraTiles = state.doraIndicators.map(nextDoraTile);
  if (doraTiles.includes(tile)) {
    danger *= 1.72;
  } else if (isDoraSide(tile, doraTiles)) {
    danger *= 1.28;
  }
  if (state.round.turn >= 13) {
    danger *= 1.18;
  }
  if (opponent.ippatsu) {
    danger *= 1.35;
  }
  if (opponent.seatWind === "1z") {
    danger *= 1.22;
  }
  return clampProbability(Math.min(0.22, danger));
}

function isThreateningOpponent(opponent: PlayerState): boolean {
  return opponent.riichi || opponent.calls.length >= 2;
}

function isSuji(tile: TileId, discards: readonly TileId[]): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  const anchors = [rank - 3, rank + 3]
    .filter((item) => item >= 1 && item <= 9)
    .map((item) => `${item}${tile[1]}` as TileId);
  return anchors.some((anchor) => discards.includes(anchor));
}

function getSujiFactor(rank: number): number {
  if (rank === 1 || rank === 9) {
    return 0.28;
  }
  if (rank === 2 || rank === 8) {
    return 0.42;
  }
  if (rank === 3 || rank === 7) {
    return 0.68;
  }
  return 0.55;
}

function getUnsujiFactor(rank: number): number {
  if (rank === 5) {
    return 1.55;
  }
  if (rank === 4 || rank === 6) {
    return 1.38;
  }
  if (rank === 3 || rank === 7) {
    return 1.18;
  }
  if (rank === 2 || rank === 8) {
    return 1.08;
  }
  return 1;
}

function getSujiCompressionFactor(state: GameState, opponent: PlayerState, tile: TileId): number {
  const passed = countPassedSujiGroups(opponent.discards.map((discard) => discard.tile));
  const sameSuitPassed = countPassedSujiGroups(
    opponent.discards.map((discard) => discard.tile).filter((discard) => discard[1] === tile[1]),
  );
  const lateTurnBonus = state.round.turn >= 13 ? 0.12 : state.round.turn >= 10 ? 0.06 : 0;
  return 1 + (passed / 18) * 0.35 + (sameSuitPassed / 6) * 0.45 + lateTurnBonus;
}

function countPassedSujiGroups(discards: readonly TileId[]): number {
  const groups = new Set<string>();
  for (const tile of discards) {
    if (tile[1] === "z") {
      continue;
    }
    const rank = Number(tile[0]);
    if (rank <= 6) {
      groups.add(`${tile[1]}:${rank}${rank + 3}`);
    }
    if (rank >= 4) {
      groups.add(`${tile[1]}:${rank - 3}${rank}`);
    }
  }
  return groups.size;
}

function hasWallSupport(state: GameState, tile: TileId): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  const wallRanks = [rank - 1, rank + 1].filter((item) => item >= 1 && item <= 9);
  return wallRanks.some((rankValue) => getVisibleCount(state, `${rankValue}${tile[1]}` as TileId) >= 4);
}

function getVisibleCount(state: GameState, tile: TileId): number {
  const suitOffset = tile[1] === "m" ? 0 : tile[1] === "p" ? 9 : tile[1] === "s" ? 18 : 27;
  return state.visibleTiles[suitOffset + Number(tile[0]) - 1] ?? 0;
}

function isDoraSide(tile: TileId, doraTiles: readonly TileId[]): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  return doraTiles.some((dora) => dora[1] === tile[1] && Math.abs(Number(dora[0]) - rank) === 1);
}

function countSharedSafeTiles(state: GameState): number {
  const threats = state.opponents.filter(isThreateningOpponent);
  if (threats.length === 0) {
    return 0;
  }
  const hand = [...(state.self.hand ?? []), ...(state.lastDraw ? [state.lastDraw] : [])];
  return hand.filter((tile) => threats.every((opponent) => (
    opponent.discards.some((discard) => discard.tile === tile)
  ))).length;
}
