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

export type StrategyMode = "attack" | "balance" | "defense" | "push";

export interface DecisionAction {
  type: "discard";
  tile: TileId;
}

export interface ActionDecision {
  mode: StrategyMode;
  action?: DecisionAction;
  analysis: EvaluatedNanikiruAnalysis;
  explanation: string;
}

export interface ChooseActionOptions {
  policy?: Partial<NanikiruPolicy>;
  useEvDecision?: boolean;
}

export function chooseAction(state: GameState, options: ChooseActionOptions = {}): ActionDecision {
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
    action: analysis.recommendation ? { type: "discard", tile: analysis.recommendation } : undefined,
    analysis,
    explanation: renderDecisionExplanation(mode, analysis, highValueHand),
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

export function buildVisibleTilesFromState(state: Pick<GameState, "self" | "opponents" | "doraIndicators" | "lastDraw">): number[] {
  return tilesToCounts34([
    ...(state.self.hand ?? []),
    ...(state.lastDraw ? [state.lastDraw] : []),
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
