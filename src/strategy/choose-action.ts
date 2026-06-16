import { DEFAULT_RULE_CONFIG } from "../core/rules.ts";
import type { GameState } from "../core/state.ts";
import { tilesToCounts34 } from "../core/counts.ts";
import type { TileId } from "../core/tile.ts";
import { analyzeHandText } from "../service/analyze.ts";
import {
  applyRiichiPlanDecision,
  evaluateNanikiru,
  type EvaluatedNanikiruAnalysis,
} from "./evaluate-nanikiru.ts";
import {
  normalizeStrategyPolicy,
  type NanikiruPolicy,
} from "./nanikiru-policy.ts";
import type { NanikiruContext } from "./nanikiru-context.ts";
import { isHighValueHand } from "./high-value.ts";
import { normalizeReasonPriorities } from "../explanation/render-nanikiru.ts";
import {
  adjustModeByPlacement,
  evaluatePlacementAdjustment,
  type PlacementAdjustment,
} from "./placement.ts";
import { applyEvDecision } from "./ev-decision.ts";
import {
  type DecisionAction,
  type DecisionPhase,
  type EvaluatedAction,
  type StrategyMode,
} from "./action-types.ts";
import { arbitrateActions, compareEvaluatedActions } from "./action-arbitration.ts";
import { discardAnalysisToActions, riichiAnalysisToActions } from "./evaluate-action.ts";
import { determineDecisionPhase, generateLegalActions } from "./legal-actions.ts";
import { evaluateAgariActions } from "./agari-evaluation.ts";
import { evaluateCallActions } from "./call-evaluation.ts";
import { evaluateKanActions } from "./kan-evaluation.ts";
import { estimateRound } from "../ev/index.ts";
import type { EvaluatedNanikiruCandidate } from "./evaluate-nanikiru.ts";
import type { AgariScoreResult } from "../scoring/index.ts";

export interface ActionDecision {
  phase: DecisionPhase;
  mode: StrategyMode;
  action?: DecisionAction;
  analysis: EvaluatedNanikiruAnalysis;
  candidates: EvaluatedAction[];
  explanation: string;
}

export interface ChooseActionOptions {
  policy?: Partial<NanikiruPolicy>;
  useEvDecision?: boolean;
}

export function chooseAction(state: GameState, options: ChooseActionOptions = {}): ActionDecision {
  const phase = determineDecisionPhase(state);
  const legalActions = generateLegalActions(state);
  const agariCandidates = evaluateAgariActions(state, phase, legalActions);
  applyAgariAcceptancePolicy(agariCandidates, state);
  const forcedAgari = selectForcedAgari(agariCandidates);
  if (forcedAgari) {
    const analysis = createEmptyAnalysis(getSelfHandForDiscard(state));
    return {
      phase,
      mode: "attack",
      action: forcedAgari.action,
      analysis,
      candidates: [...agariCandidates].sort(compareEvaluatedActions),
      explanation: renderAgariDecisionExplanation(forcedAgari),
    };
  }
  const discardDecision = canEvaluateDiscardDecision(state)
    ? evaluateDiscardDecision(state, options)
    : undefined;
  const analysis = discardDecision?.analysis ?? createEmptyAnalysis(getSelfHandForDiscard(state));
  const discardCandidates = discardDecision?.candidates ?? [];
  const riichiCandidates = discardDecision
    ? riichiAnalysisToActions(discardDecision.analysis, phase, state, legalActions)
    : [];
  const callCandidates = evaluateCallActions(state, phase, options, legalActions);
  const kanCandidates = evaluateKanActions(state, phase, legalActions);
  const passCandidates = legalActions
    .filter((item) => item.action.type === "pass")
    .map((item) => evaluatePassAction(state, item.phase, callCandidates, agariCandidates));
  const mode = discardDecision?.mode ?? "attack";
  const candidates = [
    ...agariCandidates,
    ...riichiCandidates,
    ...discardCandidates,
    ...callCandidates,
    ...kanCandidates,
    ...passCandidates,
  ];
  applyUnifiedActionEv(candidates, state, options.useEvDecision ?? true, mode);
  const sortedCandidates = [...candidates].sort(compareEvaluatedActions);
  const selected = arbitrateActions(sortedCandidates);

  return {
    phase,
    mode,
    action: selected?.action,
    analysis,
    candidates: sortedCandidates,
    explanation: selected?.category === "agari"
      ? renderAgariDecisionExplanation(selected)
      : selected?.category === "riichi"
        ? renderRiichiDecisionExplanation(selected)
      : selected?.category === "call"
        ? renderCallDecisionExplanation(selected)
      : selected?.category === "kan"
        ? renderKanDecisionExplanation(selected)
      : selected?.category === "pass"
        ? renderPassDecisionExplanation(selected)
      : renderDecisionExplanation(mode, analysis, discardDecision?.highValueHand ?? false),
  };
}

function applyUnifiedActionEv(
  candidates: EvaluatedAction[],
  state: GameState,
  enabled: boolean,
  mode: StrategyMode,
): void {
  if (!enabled) {
    return;
  }
  for (const candidate of candidates) {
    if (!candidate.legal || candidate.category === "agari" || candidate.category === "pass") {
      continue;
    }
    const estimateAction = getEstimateAction(candidate.action, state);
    if (!estimateAction) {
      continue;
    }
    try {
      const source = candidate.source as EvaluatedNanikiruCandidate | undefined;
      const originalEv = candidate.scoreBreakdown.ev ?? 0;
      const estimate = canReuseActionEstimate(candidate, estimateAction)
        ? candidate.estimate!
        : estimateRound({
          state,
          mode: "fast",
          action: estimateAction,
          candidate: source,
        });
      const nextEv = calculateActionEvScore(estimate.expectedRoundIncome.value, mode, candidate.category);
      candidate.estimate = estimate;
      candidate.scoreBreakdown.ev = nextEv;
      candidate.score += nextEv - originalEv;
      if (candidate.category === "kan") {
        candidate.reasons.push({
          type: "ev",
          polarity: nextEv >= 0 ? "positive" : "negative",
          priority: 70,
          message: `杠动作快速 EV 估算局收支约 ${Math.round(estimate.expectedRoundIncome.value)} 点。`,
          data: {
            action: estimateAction.type,
            expectedRoundIncome: estimate.expectedRoundIncome.value,
          },
        });
      }
    } catch {
      // EV is advisory. Keep the base tactical score if a candidate cannot be estimated.
    }
  }
}

function canReuseActionEstimate(
  candidate: EvaluatedAction,
  action: Parameters<typeof estimateRound>[0]["action"],
): boolean {
  if (!candidate.estimate) {
    return false;
  }
  const estimated = candidate.estimate.action;
  if (estimated.type !== action.type) {
    return false;
  }
  if (estimated.type === "discard" && action.type === "discard") {
    return estimated.tile === action.tile;
  }
  if (estimated.type === "riichi-discard" && action.type === "riichi-discard") {
    return estimated.tile === action.tile;
  }
  if (estimated.type === "call-discard" && action.type === "call-discard") {
    return estimated.callType === action.callType
      && estimated.calledTile === action.calledTile
      && estimated.tile === action.tile;
  }
  if (estimated.type === "minkan" && action.type === "minkan") {
    return estimated.calledTile === action.calledTile
      && estimated.tiles.join("|") === action.tiles.join("|");
  }
  if (
    (estimated.type === "ankan" || estimated.type === "kakan")
    && (action.type === "ankan" || action.type === "kakan")
  ) {
    return estimated.tiles.join("|") === action.tiles.join("|");
  }
  return true;
}

function getEstimateAction(
  action: DecisionAction,
  state: GameState,
): Parameters<typeof estimateRound>[0]["action"] | undefined {
  if (action.type === "discard") {
    return { type: "discard", tile: action.tile };
  }
  if (action.type === "riichi") {
    return { type: "riichi-discard", tile: action.tile };
  }
  if ((action.type === "chi" || action.type === "pon") && action.discard) {
    return {
      type: "call-discard",
      callType: action.type,
      calledTile: action.calledTile,
      tile: action.discard,
    };
  }
  if (action.type === "minkan") {
    return { type: "minkan", tiles: action.tiles, calledTile: action.calledTile };
  }
  if (action.type === "ankan" || action.type === "kakan") {
    return { type: action.type, tiles: action.tiles };
  }
  return undefined;
}

function calculateActionEvScore(
  expectedRoundIncome: number,
  mode: StrategyMode,
  category: EvaluatedAction["category"],
): number {
  const modeWeight = mode === "defense" ? 1.0 : mode === "balance" ? 0.7 : mode === "push" ? 0.5 : 0.4;
  const categoryWeight = category === "kan" ? 0.35 : category === "riichi" ? 0.55 : 1;
  return Math.round((expectedRoundIncome / 100) * modeWeight * categoryWeight * 10) / 10;
}

function selectForcedAgari(candidates: readonly EvaluatedAction[]): EvaluatedAction | undefined {
  return candidates
    .filter((candidate) => (
      candidate.legal
      && candidate.priority >= 0
      && candidate.category === "agari"
      && (candidate.action.type === "tsumo" || candidate.action.type === "ron")
    ))
    .sort(compareEvaluatedActions)[0];
}

function applyAgariAcceptancePolicy(candidates: EvaluatedAction[], state: GameState): void {
  for (const candidate of candidates) {
    if (!candidate.legal || candidate.category !== "agari") {
      continue;
    }
    const rejection = getAgariRejection(state, candidate);
    if (!rejection) {
      continue;
    }
    candidate.score = -200000;
    candidate.priority = -100;
    candidate.reasons.unshift({
      type: "placement",
      polarity: "negative",
      priority: 100,
      message: rejection,
    });
    candidate.warnings.push(candidate.reasons[0]!);
  }
}

function getAgariRejection(state: GameState, candidate: EvaluatedAction): string | undefined {
  if (!isFinalHand(state) || state.self.riichi) {
    return undefined;
  }
  const currentPoints = getCurrentPoints(state);
  const currentRank = getSelfRank(currentPoints);
  if (currentRank <= 1) {
    return undefined;
  }
  const settledPoints = getSettledAgariPoints(state, candidate);
  if (!settledPoints) {
    return undefined;
  }
  const rankAfter = getSelfRank(settledPoints);
  if (rankAfter < currentRank) {
    return undefined;
  }
  const nextDiff = getDiffToNext(currentPoints);
  if (nextDiff === undefined || nextDiff <= 0) {
    return undefined;
  }
  const gain = settledPoints[0] - currentPoints[0];
  const actionText = candidate.action.type === "tsumo" ? "自摸" : "荣和";
  return `终局名次判断：当前第 ${currentRank}，${actionText}结算后自家约 +${gain} 点，但仍无法提升名次（距上一名 ${nextDiff} 点），可选择不和继续追逆转。`;
}

function isFinalHand(state: GameState): boolean {
  return state.round.bakaze === "2z" && state.round.kyoku >= 4;
}

function getCurrentPoints(state: GameState): [number, number, number, number] {
  return [
    state.self.points,
    state.opponents[0]?.points ?? 0,
    state.opponents[1]?.points ?? 0,
    state.opponents[2]?.points ?? 0,
  ];
}

function getSelfRank(points: readonly number[]): number {
  const selfPoints = points[0] ?? 0;
  return [...points]
    .sort((a, b) => b - a)
    .findIndex((points) => points === selfPoints) + 1;
}

function getDiffToNext(points: readonly number[]): number | undefined {
  const selfPoints = points[0] ?? 0;
  const sorted = [...points].sort((a, b) => b - a);
  const index = sorted.findIndex((points) => points === selfPoints);
  if (index <= 0) {
    return undefined;
  }
  return sorted[index - 1]! - selfPoints;
}

function getSettledAgariPoints(state: GameState, candidate: EvaluatedAction): [number, number, number, number] | undefined {
  const source = candidate.source as AgariScoreResult | undefined;
  const points = source?.best?.points;
  if (!points) {
    const gain = Math.round((candidate.scoreBreakdown.agari ?? candidate.score) * 10);
    return [state.self.points + gain, ...state.opponents.map((opponent) => opponent.points)] as [number, number, number, number];
  }
  const settled = getCurrentPoints(state);
  if (candidate.action.type === "ron") {
    const payerIndex = state.phase === "chankan"
      ? state.lastKan?.playerIndex
      : state.lastDiscard?.playerIndex;
    const loss = points.ron ?? points.total;
    settled[0] += points.total;
    if (payerIndex !== undefined && payerIndex >= 1 && payerIndex <= 3) {
      settled[payerIndex] -= loss;
    }
    return settled;
  }
  if (candidate.action.type === "tsumo" && points.tsumo) {
    settled[0] += points.total;
    for (let playerIndex = 1; playerIndex <= 3; playerIndex += 1) {
      const opponent = state.opponents[playerIndex - 1];
      const payment = opponent?.seatWind === "1z"
        ? points.tsumo.dealer
        : points.tsumo.nonDealer;
      settled[playerIndex] -= payment;
    }
    return settled;
  }
  return undefined;
}

export interface DiscardDecisionEvaluation {
  mode: StrategyMode;
  analysis: EvaluatedNanikiruAnalysis;
  candidates: EvaluatedAction[];
  highValueHand: boolean;
}

export function evaluateDiscardDecision(state: GameState, options: ChooseActionOptions = {}): DiscardDecisionEvaluation {
  const phase = determineDecisionPhase(state);
  const hand = getSelfHandForDiscard(state);
  const context = gameStateToNanikiruContext(state);
  const basePolicy = normalizeStrategyPolicy(options.policy);

  const preliminary = analyzeHandText({
    text: hand.join(""),
    mode: hasOpenCall(state) ? 1 : 0,
    includeRaw: false,
    unavailableTiles: [
      ...state.doraIndicators,
      ...state.self.calls.flatMap((call) => call.tiles),
      ...state.opponents.flatMap((opponent) => [
        ...opponent.calls.flatMap((call) => call.tiles),
        ...opponent.discards.map((discard) => discard.tile),
      ]),
    ],
  });
  if (preliminary.kind !== "discard") {
    throw new Error(`GameState self hand must contain a 3n+2 discard hand, got ${preliminary.tileCount} tiles`);
  }

  const highValueHand = isHighValueHand(state);
  const placement = evaluatePlacementAdjustment(state, {
    shanten: preliminary.shanten,
    highValueHand,
  });
  const baseMode = chooseStrategyMode(state, preliminary.shanten);
  const mode = adjustModeByPlacement(baseMode, placement);
  const policy = applyPlacementPolicy(applyModePolicy(basePolicy, mode, highValueHand), placement);
  const analysis = evaluateNanikiru(preliminary, policy, context);
  applyEvDecision(analysis, state, {
    enabled: options.useEvDecision ?? true,
    mode,
  });
  applyRiichiPlanDecision(analysis);
  addPlacementReasons(analysis, placement);

  return {
    mode,
    analysis,
    candidates: discardAnalysisToActions(analysis, phase, generateLegalActions(state)),
    highValueHand,
  };
}

export function chooseStrategyMode(state: GameState, shanten: number): StrategyMode {
  const hasRiichiThreat = state.opponents.some((opponent) => opponent.riichi);
  if (!hasRiichiThreat) {
    return "attack";
  }
  if (shanten >= 2) {
    return "defense";
  }
  if (shanten === 0) {
    return "push";
  }
  if (shanten === 1 && isHighValueHand(state)) {
    return "push";
  }
  return "balance";
}

function applyModePolicy(policy: NanikiruPolicy, mode: StrategyMode, highValueHand = false): NanikiruPolicy {
  if (mode === "defense") {
    return {
      ...policy,
      defenseWeight: Math.max(policy.defenseWeight, 12),
      valueWeight: policy.valueWeight * 0.6,
      ukeireWeight: policy.ukeireWeight * 0.45,
      goodShapeWeight: policy.goodShapeWeight * 0.45,
    };
  }
  if (mode === "balance") {
    return {
      ...policy,
      defenseWeight: Math.max(policy.defenseWeight, highValueHand ? 2 : 5),
      ukeireWeight: policy.ukeireWeight * 0.8,
    };
  }
  if (mode === "push") {
    return {
      ...policy,
      defenseWeight: Math.max(policy.defenseWeight, 2),
      valueWeight: policy.valueWeight * 1.15,
    };
  }
  return policy;
}

function applyPlacementPolicy(policy: NanikiruPolicy, placement: PlacementAdjustment): NanikiruPolicy {
  return {
    ...policy,
    shantenWeight: policy.shantenWeight * placement.shantenWeightMul,
    ukeireWeight: policy.ukeireWeight * placement.ukeireWeightMul,
    defenseWeight: policy.defenseWeight * placement.defenseWeightMul,
    valueWeight: policy.valueWeight * placement.valueWeightMul,
  };
}

function addPlacementReasons(analysis: EvaluatedNanikiruAnalysis, placement: PlacementAdjustment): void {
  const best = analysis.candidates[0];
  if (!best || placement.reasons.length === 0) {
    return;
  }
  best.reasons.push(...placement.reasons);
}

function gameStateToNanikiruContext(state: GameState): NanikiruContext {
  return {
    calls: state.self.calls,
    seatWind: state.self.seatWind,
    bakaze: state.round.bakaze,
    kyoku: state.round.kyoku,
    turn: state.round.turn,
    points: state.self.points,
    opponents: state.opponents.map((opponent) => ({
      seatWind: opponent.seatWind,
      points: opponent.points,
      calls: opponent.calls,
      discards: opponent.discards,
      riichi: opponent.riichi,
      ippatsu: opponent.ippatsu,
      menzen: opponent.menzen,
    })),
    visibleTiles: state.visibleTiles,
    rules: state.rules ?? DEFAULT_RULE_CONFIG,
    honba: state.round.honba,
    riichiSticks: state.round.riichiSticks,
    doraIndicators: state.doraIndicators,
  };
}

function getSelfHandForDiscard(state: GameState): TileId[] {
  return [
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
  ];
}

function canEvaluateDiscardDecision(state: GameState): boolean {
  return getSelfHandForDiscard(state).length % 3 === 2;
}

function createEmptyAnalysis(hand: TileId[]): EvaluatedNanikiruAnalysis {
  return {
    input: hand.join(""),
    handText: hand.join(""),
    hand,
    tileCount: hand.length,
    shanten: 99,
    isTenpai: false,
    isAgari: false,
    candidates: [],
  };
}

function hasOpenCall(state: GameState): boolean {
  return state.self.calls.some((call) => call.type !== "ankan");
}

function renderDecisionExplanation(mode: StrategyMode, analysis: EvaluatedNanikiruAnalysis, highValueHand = false): string {
  const best = analysis.candidates[0];
  if (!best) {
    return "当前没有可用动作。";
  }
  const modeText = mode === "defense"
    ? "当前进入防守模式。"
    : mode === "balance"
      ? "当前采用攻守平衡模式。"
      : mode === "push"
        ? (
          analysis.shanten === 0
            ? "当前听牌，采用推进模式。"
            : highValueHand
              ? "当前一向听且打点较高，采用推进模式。"
              : "当前采用推进模式。"
        )
        : "当前采用进攻模式。";
  const reasons = normalizeReasonPriorities(best.reasons)
    .filter((reason) => reason.polarity !== "negative")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
    .map((reason) => `- ${reason.message}`);
  const warnings = best.reasons
    .filter((reason) => reason.polarity === "negative")
    .map((reason) => `- ${reason.message}`);
  const lines = [
    `推荐：切 ${best.discard}。`,
    modeText,
    "理由：",
    ...reasons,
  ];
  if (warnings.length > 0) {
    lines.push("注意：", ...warnings);
  }
  if (best.riichiJudgment) {
    lines.push(
      "立直判断：",
      `- ${best.riichiJudgment.levelText}（${best.riichiJudgment.score}/100）。`,
      ...best.riichiJudgment.reasons.slice(0, 3).map((reason) => `- ${reason}`),
    );
  }
  if (analysis.riichiPlanDecision) {
    lines.push(
      "路线判断：",
      ...analysis.riichiPlanDecision.reasons.map((reason) => `- ${reason}`),
    );
  }
  return lines.join("\n");
}

function renderAgariDecisionExplanation(candidate: EvaluatedAction): string {
  const reason = candidate.reasons[0]?.message ?? "和牌成立。";
  return [
    `推荐：${candidate.action.type === "tsumo" ? "自摸" : "荣和"}。`,
    "理由：",
    `- ${reason}`,
  ].join("\n");
}

function renderRiichiDecisionExplanation(candidate: EvaluatedAction): string {
  const tile = candidate.action.type === "riichi" ? candidate.action.tile : undefined;
  const riichiReason = candidate.reasons.find((reason) => reason.type === "riichi");
  const reasons = normalizeReasonPriorities(candidate.reasons)
    .filter((reason) => reason.polarity !== "negative")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
    .map((reason) => `- ${reason.message}`);
  return [
    `推荐：切 ${tile} 立直。`,
    "理由：",
    ...(riichiReason ? [`- ${riichiReason.message}`] : []),
    ...reasons.filter((line) => line !== `- ${riichiReason?.message}`),
  ].join("\n");
}

function renderCallDecisionExplanation(candidate: EvaluatedAction): string {
  const action = candidate.action;
  if (action.type !== "chi" && action.type !== "pon" && action.type !== "minkan") {
    return "推荐：副露。";
  }
  const callText = action.type === "pon" ? "碰" : action.type === "chi" ? "吃" : "大明杠";
  const reasons = normalizeReasonPriorities(candidate.reasons)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
    .map((reason) => `- ${reason.message}`);
  return [
    `推荐：${callText} ${action.calledTile} 后切 ${action.discard}。`,
    "理由：",
    ...reasons,
  ].join("\n");
}

function renderKanDecisionExplanation(candidate: EvaluatedAction): string {
  const action = candidate.action;
  if (action.type !== "ankan" && action.type !== "kakan" && action.type !== "minkan") {
    return "推荐：杠。";
  }
  const kanText = action.type === "ankan" ? "暗杠" : action.type === "kakan" ? "加杠" : "大明杠";
  const tile = action.tiles[0];
  const reasons = normalizeReasonPriorities(candidate.reasons)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
    .map((reason) => `- ${reason.message}`);
  return [
    `推荐：${kanText} ${tile}。`,
    "理由：",
    ...reasons,
  ].join("\n");
}

function renderPassDecisionExplanation(candidate: EvaluatedAction): string {
  const reasons = candidate.reasons
    .slice(0, 4)
    .map((reason) => `- ${reason.message}`);
  const rejectedAgari = candidate.reasons.some((reason) => (
    reason.type === "placement"
    && String(reason.message).includes("继续追逆转")
  ));
  return [
    rejectedAgari ? "推荐：不和（见逃）。" : "推荐：不鸣。",
    "理由：",
    ...reasons,
  ].join("\n");
}

function evaluatePassAction(
  state: GameState,
  phase: DecisionPhase,
  callCandidates: readonly EvaluatedAction[],
  agariCandidates: readonly EvaluatedAction[] = [],
): EvaluatedAction {
  const passEvaluation = evaluatePassBaseline(state);
  const rejectedAgariReasons = getRejectedAgariReasons(agariCandidates);
  const reasons = rejectedAgariReasons.length > 0
    ? rejectedAgariReasons
    : passEvaluation.reasons;
  return {
    action: { type: "pass" },
    phase,
    legal: true,
    score: getPassScore(state, callCandidates, passEvaluation.score),
    priority: passEvaluation.priority,
    category: "pass",
    scoreBreakdown: {
      speed: passEvaluation.speed,
      value: passEvaluation.value,
    },
    reasons,
    warnings: [],
  };
}

function getRejectedAgariReasons(candidates: readonly EvaluatedAction[]): EvaluatedAction["reasons"] {
  return candidates
    .filter((candidate) => (
      candidate.category === "agari"
      && candidate.priority < 0
      && candidate.warnings.some((warning) => warning.type === "placement")
    ))
    .flatMap((candidate) => candidate.warnings.filter((warning) => warning.type === "placement"));
}

function getPassScore(state: GameState, callCandidates: readonly EvaluatedAction[], baselineScore: number): number {
  if (!state.lastDiscard) {
    return baselineScore;
  }
  const bestCall = callCandidates
    .filter((candidate) => candidate.legal)
    .sort((a, b) => b.score - a.score)[0];
  const threatPenalty = state.opponents.some((opponent) => opponent.riichi) ? 260 : 0;
  if (!bestCall) {
    return baselineScore + threatPenalty;
  }
  const callGuardScore = bestCall.score < 180 ? bestCall.score + 80 : 0;
  return Math.max(baselineScore, callGuardScore) + threatPenalty;
}

function evaluatePassBaseline(state: GameState): {
  score: number;
  priority: number;
  speed: number;
  value: number;
  reasons: EvaluatedAction["reasons"];
} {
  let analysis: ReturnType<typeof analyzeHandText> | undefined;
  try {
    analysis = analyzeHandText({
      text: (state.self.hand ?? []).join(""),
      mode: hasOpenCall(state) ? 1 : 0,
      includeRaw: false,
      unavailableTiles: [
        ...state.doraIndicators,
        ...state.self.calls.flatMap((call) => call.tiles),
        ...state.opponents.flatMap((opponent) => [
          ...opponent.calls.flatMap((call) => call.tiles),
          ...opponent.discards.map((discard) => discard.tile),
        ]),
        ...(state.lastDiscard ? [state.lastDiscard.tile] : []),
      ],
    });
  } catch {
    analysis = undefined;
  }

  if (analysis?.kind !== "draw") {
    return {
      score: 160,
      priority: 0,
      speed: 0,
      value: 0,
      reasons: [{
        type: "rule",
        polarity: "neutral",
        priority: 10,
        message: "不鸣，保留当前手牌结构。",
      }],
    };
  }

  if (analysis.shanten <= 0) {
    const menzenBonus = state.self.menzen ? 520 : 0;
    const waitScore = analysis.totalDraws * 28 + analysis.goodShapeCount * 45;
    return {
      score: 1180 + menzenBonus + waitScore,
      priority: 60,
      speed: waitScore,
      value: menzenBonus,
      reasons: [{
        type: "rule",
        polarity: "positive",
        priority: 86,
        message: `不鸣：当前已经听牌，保留 ${analysis.totalDraws} 枚待牌${state.self.menzen ? "和门清立直价值" : ""}。`,
        data: {
          shanten: analysis.shanten,
          totalDraws: analysis.totalDraws,
          goodShapeCount: analysis.goodShapeCount,
          menzen: state.self.menzen,
        },
      }],
    };
  }

  if (analysis.shanten === 1) {
    const speedScore = analysis.totalDraws * 10 + analysis.goodShapeCount * 22;
    const menzenBonus = state.self.menzen ? 180 : 0;
    return {
      score: 260 + speedScore + menzenBonus,
      priority: 20,
      speed: speedScore,
      value: menzenBonus,
      reasons: [{
        type: "rule",
        polarity: "neutral",
        priority: 54,
        message: `不鸣：当前一向听，保留 ${analysis.totalDraws} 枚进张${state.self.menzen ? "和门清路线" : ""}。`,
        data: {
          shanten: analysis.shanten,
          totalDraws: analysis.totalDraws,
          goodShapeCount: analysis.goodShapeCount,
          menzen: state.self.menzen,
        },
      }],
    };
  }

  return {
    score: 120,
    priority: 0,
    speed: 0,
    value: 0,
    reasons: [{
      type: "rule",
      polarity: "neutral",
      priority: 10,
      message: "不鸣，保留当前手牌结构。",
    }],
  };
}

export function buildVisibleTilesFromState(
  state: Pick<GameState, "self" | "opponents" | "doraIndicators" | "lastDraw"> & Pick<Partial<GameState>, "lastDiscard">,
): number[] {
  return tilesToCounts34([
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
    ...(state.lastDiscard ? [state.lastDiscard.tile] : []),
    ...state.self.calls.flatMap((call) => call.tiles),
    ...state.self.discards.map((discard) => discard.tile),
    ...state.opponents.flatMap((opponent) => [
      ...(opponent.hand ?? []),
      ...opponent.calls.flatMap((call) => call.tiles),
      ...opponent.discards.map((discard) => discard.tile),
    ]),
    ...state.doraIndicators,
  ]);
}
