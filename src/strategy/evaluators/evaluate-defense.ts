import type { Counts34 } from "../../core/counts.ts";
import { TILES_34, TILE_INDEX, type TileId } from "../../core/tile.ts";
import type { NanikiruContext, OpponentContext } from "../nanikiru-context.ts";
import type { EvaluationPart } from "./evaluation.ts";

interface ThreatEvaluation {
  score: number;
  danger: number;
  safety: number;
  reasons: EvaluationPart["reasons"];
}

export function evaluateDefense(discard: TileId, context?: NanikiruContext): EvaluationPart;
export function evaluateDefense(
  discard: TileId,
  context: NanikiruContext | undefined,
  remainingTiles: readonly TileId[],
): EvaluationPart;
export function evaluateDefense(
  discard: TileId,
  context: NanikiruContext = {},
  remainingTiles: readonly TileId[] = [],
): EvaluationPart {
  const threats = (context.opponents ?? []).filter(isThreateningOpponent);
  if (threats.length === 0) {
    return { score: 0, reasons: [] };
  }

  const evaluations = threats.map((opponent) => evaluateAgainstOpponent(discard, opponent, context));
  const immediateScore = evaluations.reduce((total, item) => total + item.score, 0);
  const reasons = evaluations.flatMap((item) => item.reasons);

  const worst = evaluations.reduce<ThreatEvaluation | undefined>((current, item) => (
    !current || item.danger > current.danger ? item : current
  ), undefined);
  if (worst && worst.danger >= 80) {
    reasons.push({
      type: "risk",
      polarity: "negative",
      priority: 84,
      message: `切 ${discard} 对威胁者危险度较高。`,
      data: { discard, danger: worst.danger, safety: worst.safety },
    });
  }

  const reserve = calculateDefenseReserveScore(remainingTiles, threats);
  const safeTileCount = countSafeTilesAfterDiscard(remainingTiles, threats);
  const penalty = futureDefensePenalty(safeTileCount);

  if (reserve >= 100) {
    reasons.push({
      type: "defense",
      polarity: "positive",
      priority: 74,
      message: `切 ${discard} 后仍保留 ${safeTileCount} 张较可靠防守牌。`,
      data: { discard, defenseReserve: reserve, safeTileCount },
    });
  }
  if (penalty > 0) {
    reasons.push({
      type: "risk",
      polarity: "negative",
      priority: safeTileCount === 0 ? 88 : 70,
      message: `切 ${discard} 后后续防守资源偏少。`,
      data: { discard, safeTileCount, futureDefensePenalty: penalty },
    });
  }

  return { score: immediateScore + reserve - penalty, reasons };
}

function isThreateningOpponent(opponent: OpponentContext): boolean {
  return opponent.riichi === true || (opponent.calls ?? []).length >= 2;
}

function evaluateAgainstOpponent(
  discard: TileId,
  opponent: OpponentContext,
  context: NanikiruContext,
): ThreatEvaluation {
  const discards = (opponent.discards ?? []).map((item) => item.tile);
  const visibleTiles = context.visibleTiles;
  const doraTiles = (context.doraIndicators ?? []).map(nextDoraTile);
  const reasons: EvaluationPart["reasons"] = [];

  if (discards.includes(discard)) {
    const score = opponent.riichi ? 140 : 90;
    reasons.push({
      type: "defense",
      polarity: "positive",
      priority: 98,
      message: `切 ${discard} 是现物，安全度最高。`,
      data: { discard, riichi: opponent.riichi === true },
    });
    return { score, danger: 0, safety: score, reasons };
  }

  let danger = opponent.riichi ? 80 : 45;
  let safety = 0;

  if (isHonor(discard)) {
    danger -= 18;
    const visibleCount = countVisible(discard, visibleTiles);
    if (visibleCount >= 3) {
      safety += 70;
      reasons.push({
        type: "defense",
        polarity: "positive",
        priority: 76,
        message: `${discard} 已见 ${visibleCount} 张，字牌安全度较高。`,
        data: { discard, visibleCount },
      });
    } else if (visibleCount >= 2) {
      safety += 35;
    }
  } else {
    if (isTerminal(discard)) {
      danger -= 12;
    }
    const sujiSafety = sujiSafetyScore(discard, discards.includes(discard), discards);
    if (sujiSafety > 0) {
      safety += sujiSafety;
      reasons.push({
        type: "defense",
        polarity: "positive",
        priority: 68,
        message: `${discard} 有筋可依，安全度按牌位修正。`,
        data: { discard, sujiSafety },
      });
    } else {
      const middleDanger = unSujiMiddleDanger(discard);
      if (middleDanger > 0) {
        danger += middleDanger;
        reasons.push({
          type: "risk",
          polarity: "negative",
          priority: getUnSujiMiddleDangerPriority(middleDanger),
          message: `${discard} 是无筋中张，按牌位提高危险度。`,
          data: { discard, middleDanger },
        });
      }
    }
    if (hasWallSupport(discard, visibleTiles)) {
      safety += 50;
      reasons.push({
        type: "defense",
        polarity: "positive",
        priority: 72,
        message: `${discard} 有壁信息支撑，安全度上升。`,
        data: { discard },
      });
    }
  }

  if (doraTiles.includes(discard)) {
    danger += 45;
    reasons.push({
      type: "risk",
      polarity: "negative",
      priority: 82,
      message: `${discard} 是宝牌，对威胁者风险较高。`,
      data: { discard, doraTiles },
    });
  } else if (isDoraSide(discard, doraTiles)) {
    danger += 18;
  }

  const turn = context.turn ?? 8;
  if (turn >= 13) {
    danger += 15;
  }
  if (opponent.ippatsu === true) {
    danger += 30;
    reasons.push({
      type: "risk",
      polarity: "negative",
      priority: 86,
      message: "对手处于一发巡，当前切牌风险上升。",
      data: { discard },
    });
  }
  if (isDealer(opponent)) {
    danger += 25;
    reasons.push({
      type: "risk",
      polarity: "negative",
      priority: 80,
      message: "威胁者是亲家，放铳损失更高。",
      data: { discard, seatWind: opponent.seatWind },
    });
  }

  const score = safety - danger;
  return { score, danger, safety, reasons };
}

function countVisible(tile: TileId, visibleTiles?: Counts34): number {
  return visibleTiles?.[TILE_INDEX[tile]] ?? 0;
}

function isHonor(tile: TileId): boolean {
  return tile[1] === "z";
}

function isTerminal(tile: TileId): boolean {
  return tile[1] !== "z" && (tile[0] === "1" || tile[0] === "9");
}

function isSuji(tile: TileId, discards: readonly TileId[]): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  const suit = tile[1];
  const anchors = [rank - 3, rank + 3]
    .filter((item) => item >= 1 && item <= 9)
    .map((item) => `${item}${suit}` as TileId);
  return anchors.some((anchor) => discards.includes(anchor));
}

function calculateDefenseReserveScore(remainingTiles: readonly TileId[], threats: readonly OpponentContext[]): number {
  let score = 0;

  for (const tile of remainingTiles) {
    score += getDefenseReserveTileScore(tile, threats);
  }

  return score;
}

function countSafeTilesAfterDiscard(remainingTiles: readonly TileId[], threats: readonly OpponentContext[]): number {
  return remainingTiles.filter((tile) => getDefenseReserveTileScore(tile, threats) >= 35).length;
}

function getDefenseReserveTileScore(tile: TileId, threats: readonly OpponentContext[]): number {
  const threatDiscards = threats.flatMap((opponent) => (opponent.discards ?? []).map((discard) => discard.tile));
  if (threatDiscards.includes(tile)) {
    return 100;
  }
  return sujiSafetyScore(tile, false, threatDiscards);
}

function futureDefensePenalty(safeTileCountAfterDiscard: number): number {
  if (safeTileCountAfterDiscard === 0) {
    return 220;
  }
  if (safeTileCountAfterDiscard === 1) {
    return 120;
  }
  if (safeTileCountAfterDiscard === 2) {
    return 50;
  }
  return 0;
}

function sujiSafetyScore(tile: TileId, isGenbutsu: boolean, discards: readonly TileId[]): number {
  if (isGenbutsu) {
    return 100;
  }
  if (!isSuji(tile, discards)) {
    return 0;
  }
  const rank = Number(tile[0]);
  if (isSujiTerminalRank(rank)) {
    return 45;
  }
  if (isSuji28Rank(rank)) {
    return 35;
  }
  if (isSuji456Rank(rank)) {
    return 20;
  }
  if (isSuji37Rank(rank)) {
    return 10;
  }
  return 0;
}

function isSujiTerminalRank(rank: number): boolean {
  return rank === 1 || rank === 9;
}

function isSuji28Rank(rank: number): boolean {
  return rank === 2 || rank === 8;
}

function isSuji456Rank(rank: number): boolean {
  return rank === 4 || rank === 5 || rank === 6;
}

function isSuji37Rank(rank: number): boolean {
  return rank === 3 || rank === 7;
}

function unSujiMiddleDanger(tile: TileId): number {
  if (tile[1] === "z" || isTerminal(tile)) {
    return 0;
  }
  const rank = Number(tile[0]);
  if (rank === 5) {
    return 30;
  }
  if (rank === 4 || rank === 6) {
    return 24;
  }
  if (rank === 3 || rank === 7) {
    return 16;
  }
  if (rank === 2 || rank === 8) {
    return 8;
  }
  return 0;
}

function getUnSujiMiddleDangerPriority(middleDanger: number): number {
  if (middleDanger >= 30) {
    return 83;
  }
  if (middleDanger >= 24) {
    return 78;
  }
  if (middleDanger >= 16) {
    return 72;
  }
  return 66;
}

function isDealer(opponent: OpponentContext): boolean {
  return opponent.seatWind === "1z";
}

function hasWallSupport(tile: TileId, visibleTiles?: Counts34): boolean {
  if (!visibleTiles || tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  const suit = tile[1];
  const wallRanks = [rank - 1, rank + 1].filter((item) => item >= 1 && item <= 9);
  return wallRanks.some((item) => visibleTiles[TILE_INDEX[`${item}${suit}` as TileId]] >= 4);
}

function isDoraSide(tile: TileId, doraTiles: readonly TileId[]): boolean {
  if (tile[1] === "z") {
    return false;
  }
  const rank = Number(tile[0]);
  return doraTiles.some((dora) => (
    dora[1] === tile[1]
    && dora[1] !== "z"
    && Math.abs(Number(dora[0]) - rank) === 1
  ));
}

function nextDoraTile(indicator: TileId): TileId {
  const suit = indicator[1];
  const rank = Number(indicator[0]);
  if (suit === "z") {
    if (rank >= 1 && rank <= 4) {
      return TILES_34[27 + (rank % 4)];
    }
    return ({ 5: "6z", 6: "7z", 7: "5z" } as Record<number, TileId>)[rank];
  }
  const nextRank = rank === 9 ? 1 : rank + 1;
  return `${nextRank}${suit}` as TileId;
}
