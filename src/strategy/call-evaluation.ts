import type { Call, CallFrom, GameState } from "../core/state.ts";
import { tileFromId, type TileId } from "../core/tile.ts";
import { analyzeHandText } from "../service/analyze.ts";
import type { ChooseActionOptions } from "./choose-action.ts";
import { evaluateDiscardDecision } from "./choose-action.ts";
import { discardAnalysisToActions } from "./evaluate-action.ts";
import type { DecisionAction, DecisionPhase, EvaluatedAction } from "./action-types.ts";
import type { Reason } from "./reason.ts";
import type { EvaluatedNanikiruCandidate } from "./evaluate-nanikiru.ts";

interface CallPattern {
  type: "chi" | "pon";
  tiles: TileId[];
  consumed: TileId[];
  calledTile: TileId;
}

export function evaluateCallActions(
  state: GameState,
  phase: DecisionPhase,
  options: ChooseActionOptions = {},
): EvaluatedAction[] {
  if (phase !== "opponent_discard" || !state.lastDiscard || state.self.riichi) {
    return [];
  }

  const before = analyzeHandText({
    text: (state.self.hand ?? []).join(""),
    mode: hasOpenCall(state) ? 1 : 0,
    includeRaw: false,
    unavailableTiles: getUnavailableTiles(state),
  });
  const beforeShanten = before.shanten;

  return [
    ...generatePonPatterns(state),
    ...generateChiPatterns(state),
  ].flatMap((pattern) => evaluateCallPattern(state, phase, pattern, beforeShanten, options));
}

function evaluateCallPattern(
  state: GameState,
  phase: DecisionPhase,
  pattern: CallPattern,
  beforeShanten: number,
  options: ChooseActionOptions,
): EvaluatedAction[] {
  const calledState = applyCallPattern(state, pattern);
  let discardDecision: ReturnType<typeof evaluateDiscardDecision>;
  try {
    discardDecision = evaluateDiscardDecision(calledState, options);
  } catch {
    return [];
  }

  return discardAnalysisToActions(discardDecision.analysis, phase)
    .map((discardAction) => callDiscardToAction(state, discardAction, pattern, beforeShanten));
}

function callDiscardToAction(
  state: GameState,
  discardAction: EvaluatedAction,
  pattern: CallPattern,
  beforeShanten: number,
): EvaluatedAction {
  const source = discardAction.source as EvaluatedNanikiruCandidate | undefined;
  const discard = source?.discard ?? (
    discardAction.action.type === "discard" ? discardAction.action.tile : undefined
  );
  if (!discard) {
    throw new Error("Call discard candidate is missing discard tile.");
  }

  const afterShanten = source?.shanten ?? 99;
  const shantenGain = beforeShanten - afterShanten;
  const yakuReady = hasLikelyOpenYaku(state, pattern, discardAction);
  const threat = hasThreat(discardAction);
  const callCost = getCallCost(pattern.type, shantenGain, yakuReady, threat);
  const shapePenalty = evaluateYakuhaiPairShapePenalty(state, pattern, source, beforeShanten, shantenGain);
  const lowValueBehindPenalty = evaluateLowValueBehindPenalty(state, pattern, discardAction, shantenGain);
  const speedBonus = getCallSpeedBonus(beforeShanten, shantenGain);
  const yakuBonus = yakuReady ? 960 : -700;
  const tacticalScore = Math.round(
    (discardAction.score * 0.55)
    + speedBonus
    + yakuBonus
    - callCost
    - shapePenalty.score
    - lowValueBehindPenalty.score,
  );
  const action: DecisionAction = pattern.type === "pon"
    ? {
      type: "pon",
      tiles: pattern.tiles,
      calledTile: pattern.calledTile,
      discard,
    }
    : {
      type: "chi",
      tiles: pattern.tiles,
      calledTile: pattern.calledTile,
      discard,
    };
  const callReason: Reason = {
    type: "rule",
    polarity: tacticalScore >= 0 ? "positive" : "negative",
    priority: yakuReady ? 72 : 58,
    message: `${formatCallType(pattern.type)} ${pattern.calledTile} 后切 ${discard}，${formatShantenGain(shantenGain)}${yakuReady ? "，有可见役路线" : "，但副露后役不明确"}。`,
    data: {
      callType: pattern.type,
      calledTile: pattern.calledTile,
      discard,
      beforeShanten,
      afterShanten,
      shantenGain,
      yakuReady,
    },
  };
  const reasons = [
    callReason,
    ...(shapePenalty.reason ? [shapePenalty.reason] : []),
    ...(lowValueBehindPenalty.reason ? [lowValueBehindPenalty.reason] : []),
    ...discardAction.reasons,
  ];

  return {
    action,
    phase: discardAction.phase,
    legal: true,
    score: tacticalScore,
    priority: yakuReady && shantenGain > 0 ? 35 : -20,
    category: "call",
    scoreBreakdown: {
      ...discardAction.scoreBreakdown,
      speed: (discardAction.scoreBreakdown.speed ?? 0) + speedBonus,
      callCost: callCost + shapePenalty.score + lowValueBehindPenalty.score,
    },
    estimate: discardAction.estimate
      ? {
        ...discardAction.estimate,
        action: {
          type: "call-discard",
          callType: pattern.type,
          calledTile: pattern.calledTile,
          tile: discard,
        },
      }
      : undefined,
    reasons,
    warnings: reasons.filter((reason) => reason.polarity === "negative"),
    source: discardAction.source,
  };
}

function generatePonPatterns(state: GameState): CallPattern[] {
  const calledTile = state.lastDiscard?.tile;
  if (!calledTile) {
    return [];
  }
  const count = (state.self.hand ?? []).filter((tile) => tile === calledTile).length;
  if (count < 2) {
    return [];
  }
  return [{
    type: "pon",
    tiles: [calledTile, calledTile, calledTile],
    consumed: [calledTile, calledTile],
    calledTile,
  }];
}

function generateChiPatterns(state: GameState): CallPattern[] {
  const calledTile = state.lastDiscard?.tile;
  if (!calledTile || !canChiFromDiscard(state)) {
    return [];
  }
  const tile = tileFromId(calledTile);
  if (tile.suit === "z") {
    return [];
  }
  const patterns: CallPattern[] = [];
  for (const start of [tile.rank - 2, tile.rank - 1, tile.rank]) {
    if (start < 1 || start > 7) {
      continue;
    }
    const sequence = [start, start + 1, start + 2].map((rank) => `${rank}${tile.suit}` as TileId);
    if (!sequence.includes(calledTile)) {
      continue;
    }
    const consumed = sequence.filter((item) => item !== calledTile);
    if (hasTiles(state.self.hand ?? [], consumed)) {
      patterns.push({
        type: "chi",
        tiles: sequence,
        consumed,
        calledTile,
      });
    }
  }
  return patterns;
}

function applyCallPattern(state: GameState, pattern: CallPattern): GameState {
  const call: Call = {
    type: pattern.type,
    tiles: pattern.tiles,
    calledTile: pattern.calledTile,
    from: getCallFrom(state.lastDiscard?.playerIndex),
  };
  return {
    ...state,
    lastDiscard: undefined,
    lastDraw: undefined,
    self: {
      ...state.self,
      hand: removeTiles(state.self.hand ?? [], pattern.consumed),
      calls: [...state.self.calls, call],
      menzen: false,
    },
  };
}

function canChiFromDiscard(state: GameState): boolean {
  const playerIndex = state.lastDiscard?.playerIndex;
  return playerIndex === 3;
}

function getCallFrom(playerIndex: number | undefined): CallFrom | undefined {
  if (playerIndex === 1) {
    return "right";
  }
  if (playerIndex === 2) {
    return "across";
  }
  if (playerIndex === 3) {
    return "left";
  }
  return undefined;
}

function hasLikelyOpenYaku(state: GameState, pattern: CallPattern, action: EvaluatedAction): boolean {
  if (isYakuhai(state, pattern.calledTile)) {
    return true;
  }
  if (action.reasons.some((reason) => (
    reason.type === "value"
    && (
      String(reason.message).includes("断幺")
      || String(reason.message).includes("役牌")
      || String(reason.message).includes("染手")
      || String(reason.message).includes("对对和")
      || String(reason.message).includes("一气通贯")
      || String(reason.message).includes("三色")
    )
  ))) {
    return true;
  }
  return pattern.tiles.every((tile) => !isYaochu(tile));
}

function getCallCost(type: "chi" | "pon", shantenGain: number, yakuReady: boolean, threat: boolean): number {
  let cost = type === "pon" ? 180 : 220;
  if (shantenGain <= 0) {
    cost += yakuReady ? 350 : 560;
  }
  if (!yakuReady) {
    cost += 520;
  }
  if (threat) {
    cost += 700;
  }
  return cost;
}

function getCallSpeedBonus(beforeShanten: number, shantenGain: number): number {
  if (shantenGain > 0) {
    return shantenGain * (beforeShanten >= 2 ? 1280 : 520);
  }
  return shantenGain * 360;
}

function evaluateYakuhaiPairShapePenalty(
  state: GameState,
  pattern: CallPattern,
  candidate: EvaluatedNanikiruCandidate | undefined,
  beforeShanten: number,
  shantenGain: number,
): { score: number; reason?: Reason } {
  if (
    pattern.type !== "pon"
    || !isYakuhai(state, pattern.calledTile)
    || !isUniquePair(state.self.hand ?? [], pattern.calledTile)
    || isDoraTile(state, pattern.calledTile)
  ) {
    return { score: 0 };
  }

  const goodFinalTenpai = candidate
    && candidate.shanten === 0
    && candidate.totalWaits >= 6
    && candidate.goodShapeCount >= 4;
  if (goodFinalTenpai) {
    return { score: 0 };
  }

  const speedException = beforeShanten >= 2 && shantenGain > 0;
  const score = speedException ? 220 : shantenGain > 0 ? 1120 : 1480;
  return {
    score,
    reason: {
      type: "shape",
      polarity: speedException ? "neutral" : "negative",
      priority: 78,
      message: speedException
        ? `役牌 ${pattern.calledTile} 是当前唯一对子，但当前向听较高，碰牌降向听的速度收益可抵消部分形状损失。`
        : `役牌 ${pattern.calledTile} 是当前唯一对子，碰掉后容易失去雀头和门清好形价值。`,
      data: {
        calledTile: pattern.calledTile,
        uniquePair: true,
        beforeShanten,
        shantenGain,
        afterShanten: candidate?.shanten,
        totalWaits: candidate?.totalWaits,
        goodShapeCount: candidate?.goodShapeCount,
      },
    },
  };
}

function evaluateLowValueBehindPenalty(
  state: GameState,
  pattern: CallPattern,
  action: EvaluatedAction,
  shantenGain: number,
): { score: number; reason?: Reason } {
  if (
    !state.self.menzen
    || !isSignificantlyBehind(state)
    || shantenGain > 1
    || isDoraTile(state, pattern.calledTile)
  ) {
    return { score: 0 };
  }

  const valueScore = action.scoreBreakdown.value ?? 0;
  if (valueScore >= 700 || hasHighValueReason(action)) {
    return { score: 0 };
  }

  return {
    score: 1900,
    reason: {
      type: "placement",
      polarity: "negative",
      priority: 82,
      message: "当前点棒落后较多，副露后打点偏低，优先保留门清立直提升打点的路线。",
      data: {
        selfPoints: state.self.points,
        topPoints: Math.max(...state.opponents.map((opponent) => opponent.points), state.self.points),
        valueScore,
        callType: pattern.type,
        calledTile: pattern.calledTile,
      },
    },
  };
}

function hasThreat(action: EvaluatedAction): boolean {
  return (action.scoreBreakdown.defense ?? 0) < -180
    || action.warnings.some((warning) => warning.type === "risk" || warning.type === "defense");
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

function hasTiles(hand: readonly TileId[], tiles: readonly TileId[]): boolean {
  const rest = [...hand];
  for (const tile of tiles) {
    const index = rest.indexOf(tile);
    if (index < 0) {
      return false;
    }
    rest.splice(index, 1);
  }
  return true;
}

function removeTiles(hand: readonly TileId[], tiles: readonly TileId[]): TileId[] {
  const rest = [...hand];
  for (const tile of tiles) {
    const index = rest.indexOf(tile);
    if (index >= 0) {
      rest.splice(index, 1);
    }
  }
  return rest;
}

function isUniquePair(hand: readonly TileId[], tile: TileId): boolean {
  const counts = countTiles(hand);
  return counts.get(tile) === 2
    && [...counts.values()].filter((count) => count >= 2).length === 1;
}

function isYakuhai(state: GameState, tile: TileId): boolean {
  return tile === "5z"
    || tile === "6z"
    || tile === "7z"
    || tile === state.self.seatWind
    || tile === state.round.bakaze;
}

function isDoraTile(state: GameState, tile: TileId): boolean {
  return state.doraIndicators.map(nextDoraTile).includes(tile);
}

function isSignificantlyBehind(state: GameState): boolean {
  const allPoints = [state.self.points, ...state.opponents.map((opponent) => opponent.points)];
  const topPoints = Math.max(...allPoints);
  const sorted = [...allPoints].sort((a, b) => b - a);
  const rank = sorted.findIndex((points) => points === state.self.points) + 1;
  return topPoints - state.self.points >= 10000 || rank >= 4;
}

function hasHighValueReason(action: EvaluatedAction): boolean {
  return action.reasons.some((reason) => (
    (reason.type === "value" || reason.type === "highPoints")
    && (
      reason.data?.highPoints === true
      || String(reason.message).includes("满贯")
      || String(reason.message).includes("高打点")
      || String(reason.message).includes("7700")
      || String(reason.message).includes("11600")
      || String(reason.message).includes("12000")
    )
  ));
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

function countTiles(hand: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of hand) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function isYaochu(tile: TileId): boolean {
  const parsed = tileFromId(tile);
  return parsed.suit === "z" || parsed.rank === 1 || parsed.rank === 9;
}

function formatCallType(type: "chi" | "pon"): string {
  return type === "pon" ? "碰" : "吃";
}

function formatShantenGain(gain: number): string {
  if (gain > 0) {
    return `向听下降 ${gain}`;
  }
  if (gain === 0) {
    return "向听不变";
  }
  return `向听后退 ${Math.abs(gain)}`;
}
