import type { Call, GameState } from "../core/state.ts";
import { type TileId } from "../core/tile.ts";
import { analyzeHandText } from "../service/analyze.ts";
import type { DecisionAction, DecisionPhase, EvaluatedAction } from "./action-types.ts";
import type { Reason } from "./reason.ts";

type KanType = "ankan" | "kakan" | "minkan";

interface KanPattern {
  type: KanType;
  tiles: TileId[];
  calledTile?: TileId;
}

interface ShantenSnapshot {
  shanten: number;
  totalDraws: number;
  goodShapeCount: number;
}

export function evaluateKanActions(state: GameState, phase: DecisionPhase): EvaluatedAction[] {
  if (state.self.riichi) {
    return [];
  }
  if (phase === "self_draw") {
    return [
      ...generateAnkanPatterns(state),
      ...generateKakanPatterns(state),
    ].map((pattern) => evaluateKanPattern(state, phase, pattern));
  }
  if (phase === "opponent_discard") {
    return generateMinkanPatterns(state).map((pattern) => evaluateKanPattern(state, phase, pattern));
  }
  return [];
}

function evaluateKanPattern(state: GameState, phase: DecisionPhase, pattern: KanPattern): EvaluatedAction {
  const snapshot = getShantenSnapshot(state);
  const hasRiichiThreat = state.opponents.some((opponent) => opponent.riichi);
  const highValue = hasHighValueSignal(state, pattern.tiles[0]);
  const behind = isBehind(state);
  const finalLead = isFinalLead(state);
  const speedScore = getKanSpeedScore(snapshot);
  const valueScore = getKanValueScore(state, highValue, behind);
  const kanRisk = getKanRiskPenalty(pattern.type, snapshot.shanten, hasRiichiThreat, finalLead);
  const score = speedScore + valueScore - kanRisk;
  const action = patternToAction(pattern);
  const reasons = buildKanReasons({
    pattern,
    snapshot,
    hasRiichiThreat,
    highValue,
    behind,
    finalLead,
    score,
  });

  return {
    action,
    phase,
    legal: true,
    score,
    priority: score > 0 ? 18 : -30,
    category: "kan",
    scoreBreakdown: {
      speed: speedScore,
      value: valueScore,
      kanRisk,
    },
    reasons,
    warnings: reasons.filter((reason) => reason.polarity === "negative"),
  };
}

function generateAnkanPatterns(state: GameState): KanPattern[] {
  const hand = getSelfHandWithDraw(state);
  return [...countTiles(hand).entries()]
    .filter(([, count]) => count >= 4)
    .map(([tile]) => ({
      type: "ankan",
      tiles: [tile, tile, tile, tile],
    }));
}

function generateKakanPatterns(state: GameState): KanPattern[] {
  const hand = getSelfHandWithDraw(state);
  const counts = countTiles(hand);
  return state.self.calls
    .filter((call) => call.type === "pon")
    .flatMap((call) => {
      const tile = getCallBaseTile(call);
      if (!tile || (counts.get(tile) ?? 0) < 1) {
        return [];
      }
      return [{
        type: "kakan" as const,
        tiles: [tile, tile, tile, tile],
        calledTile: tile,
      }];
    });
}

function generateMinkanPatterns(state: GameState): KanPattern[] {
  const calledTile = state.lastDiscard?.tile;
  if (!calledTile || state.lastDiscard?.playerIndex === 0) {
    return [];
  }
  const count = (state.self.hand ?? []).filter((tile) => tile === calledTile).length;
  if (count < 3) {
    return [];
  }
  return [{
    type: "minkan",
    tiles: [calledTile, calledTile, calledTile, calledTile],
    calledTile,
  }];
}

function patternToAction(pattern: KanPattern): DecisionAction {
  if (pattern.type === "minkan") {
    return {
      type: "minkan",
      tiles: pattern.tiles,
      calledTile: pattern.calledTile ?? pattern.tiles[0],
    };
  }
  if (pattern.type === "kakan") {
    return {
      type: "kakan",
      tiles: pattern.tiles,
    };
  }
  return {
    type: "ankan",
    tiles: pattern.tiles,
  };
}

function getShantenSnapshot(state: GameState): ShantenSnapshot {
  try {
    const analysis = analyzeHandText({
      text: getSelfHandWithDraw(state).join(""),
      mode: hasOpenCall(state) ? 1 : 0,
      includeRaw: false,
      unavailableTiles: getUnavailableTiles(state),
    });
    return {
      shanten: analysis.shanten,
      totalDraws: "totalDraws" in analysis ? analysis.totalDraws : 0,
      goodShapeCount: "goodShapeCount" in analysis ? analysis.goodShapeCount : 0,
    };
  } catch {
    return {
      shanten: 3,
      totalDraws: 0,
      goodShapeCount: 0,
    };
  }
}

function getKanSpeedScore(snapshot: ShantenSnapshot): number {
  if (snapshot.shanten <= 0) {
    return 1800 + snapshot.totalDraws * 18 + snapshot.goodShapeCount * 36;
  }
  if (snapshot.shanten === 1) {
    return 360 + snapshot.totalDraws * 5;
  }
  return -520 - snapshot.shanten * 180;
}

function getKanValueScore(state: GameState, highValue: boolean, behind: boolean): number {
  let score = 180;
  if (highValue) {
    score += 420;
  }
  if (behind) {
    score += 320;
  }
  if (state.round.riichiSticks > 0) {
    score += Math.min(240, state.round.riichiSticks * 80);
  }
  return score;
}

function getKanRiskPenalty(type: KanType, shanten: number, hasRiichiThreat: boolean, finalLead: boolean): number {
  let penalty = type === "ankan" ? 260 : type === "kakan" ? 520 : 680;
  if (shanten >= 2) {
    penalty += 720;
  }
  if (hasRiichiThreat) {
    penalty += type === "ankan" ? 980 : 1600;
  }
  if (finalLead) {
    penalty += 2400;
  }
  return penalty;
}

function buildKanReasons(input: {
  pattern: KanPattern;
  snapshot: ShantenSnapshot;
  hasRiichiThreat: boolean;
  highValue: boolean;
  behind: boolean;
  finalLead: boolean;
  score: number;
}): Reason[] {
  const tile = input.pattern.tiles[0];
  const reasons: Reason[] = [{
    type: "rule",
    polarity: input.score > 0 ? "positive" : "neutral",
    priority: 64,
    message: `${formatKanType(input.pattern.type)} ${tile}：当前${formatShanten(input.snapshot.shanten)}，开杠可增加岭上摸牌和宝牌收益。`,
    data: {
      kanType: input.pattern.type,
      tile,
      shanten: input.snapshot.shanten,
      totalDraws: input.snapshot.totalDraws,
      goodShapeCount: input.snapshot.goodShapeCount,
    },
  }];
  if (input.highValue || input.behind) {
    reasons.push({
      type: input.behind ? "placement" : "value",
      polarity: "positive",
      priority: 58,
      message: input.behind
        ? "当前点棒落后，杠带来的打点提升更有价值。"
        : "手牌已有宝牌或供托收益，杠后打点提升更有意义。",
      data: {
        highValue: input.highValue,
        behind: input.behind,
      },
    });
  }
  if (input.hasRiichiThreat) {
    reasons.push({
      type: "risk",
      polarity: "negative",
      priority: 92,
      message: "已有对手立直，开杠会增加新宝牌风险，默认保守。",
      data: {
        kanType: input.pattern.type,
      },
    });
  }
  if (input.snapshot.shanten >= 2) {
    reasons.push({
      type: "shanten",
      polarity: "negative",
      priority: 80,
      message: "当前二向听以上，开杠收益不足以抵消给对手增加宝牌的风险。",
      data: {
        shanten: input.snapshot.shanten,
      },
    });
  }
  if (input.finalLead) {
    reasons.push({
      type: "placement",
      polarity: "negative",
      priority: 84,
      message: "终局附近且自家领先，优先避免开杠扩大局面波动。",
    });
  }
  return reasons;
}

function getSelfHandWithDraw(state: GameState): TileId[] {
  return [
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
  ];
}

function hasOpenCall(state: GameState): boolean {
  return state.self.calls.some((call) => call.type !== "ankan");
}

function getUnavailableTiles(state: GameState): TileId[] {
  return [
    ...state.doraIndicators,
    ...state.self.calls.flatMap((call) => call.tiles),
    ...state.opponents.flatMap((opponent) => [
      ...opponent.calls.flatMap((call) => call.tiles),
      ...opponent.discards.map((discard) => discard.tile),
    ]),
    ...(state.lastDiscard ? [state.lastDiscard.tile] : []),
  ];
}

function hasHighValueSignal(state: GameState, kanTile: TileId): boolean {
  return state.doraIndicators.map(nextDoraTile).includes(kanTile)
    || state.self.hand?.some((tile) => state.doraIndicators.map(nextDoraTile).includes(tile)) === true
    || state.round.riichiSticks > 0;
}

function isBehind(state: GameState): boolean {
  const topPoints = Math.max(state.self.points, ...state.opponents.map((opponent) => opponent.points));
  return topPoints - state.self.points >= 8000;
}

function isFinalLead(state: GameState): boolean {
  if (state.round.bakaze !== "2z" || state.round.kyoku < 4) {
    return false;
  }
  const second = [state.self.points, ...state.opponents.map((opponent) => opponent.points)]
    .sort((a, b) => b - a)[1] ?? state.self.points;
  return state.self.points - second >= 8000;
}

function getCallBaseTile(call: Call): TileId | undefined {
  return call.calledTile ?? call.tiles[0];
}

function countTiles(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function nextDoraTile(indicator: TileId): TileId {
  const suit = indicator[1];
  const rank = Number(indicator[0]);
  if (suit === "z") {
    if (rank >= 1 && rank <= 4) {
      return `${rank === 4 ? 1 : rank + 1}z` as TileId;
    }
    return ({ 5: "6z", 6: "7z", 7: "5z" } as Record<number, TileId>)[rank];
  }
  return `${rank === 9 ? 1 : rank + 1}${suit}` as TileId;
}

function formatKanType(type: KanType): string {
  if (type === "ankan") {
    return "暗杠";
  }
  if (type === "kakan") {
    return "加杠";
  }
  return "大明杠";
}

function formatShanten(shanten: number): string {
  if (shanten <= -1) {
    return "和牌";
  }
  if (shanten === 0) {
    return "听牌";
  }
  return `${shanten} 向听`;
}
