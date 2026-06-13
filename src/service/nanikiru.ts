import type { TileId, WindTile } from "../core/tile.ts";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import { parseTileGroupsWithRed } from "../core/tile.ts";
import { tilesToCounts34 } from "../core/counts.ts";
import { renderNanikiruExplanation } from "../explanation/render-nanikiru.ts";
import {
  type ShantenMode,
  type TileInfo,
} from "../hand/paili.ts";
import { analyzeHandText, type DiscardAnalysis } from "./analyze.ts";
import { HandTextParseError, parseHandText } from "./parse-hand.ts";
import {
  applyRiichiPlanDecision,
  evaluateNanikiru,
  type EvaluatedNanikiruCandidate,
  type NanikiruScoreBreakdown,
  type RiichiPlanDecision,
} from "../strategy/evaluate-nanikiru.ts";
import {
  normalizeStrategyPolicy,
  type NanikiruPolicy,
} from "../strategy/nanikiru-policy.ts";
import {
  getContextVisibleTiles,
  isOpenHand,
  type NanikiruContext,
} from "../strategy/nanikiru-context.ts";
import type { Reason } from "../strategy/reason.ts";
import type { Call, GameState, PlayerState } from "../core/state.ts";
import type { RoundEstimate } from "../ev/index.ts";
import { applyEvDecision } from "../strategy/ev-decision.ts";
import type { RiichiJudgment } from "../strategy/riichi.ts";

export interface NanikiruInput {
  text: string;
  mode?: ShantenMode;
  policy?: Partial<NanikiruPolicy>;
  includeCandidates?: boolean;
  includeRaw?: boolean;
  verbose?: boolean;
  calls?: Call[];
  seatWind?: WindTile;
  bakaze?: WindTile;
  kyoku?: number;
  points?: number;
  opponents?: NanikiruContext["opponents"];
  rules?: RuleConfig;
  honba?: number;
  turn?: number;
  riichiSticks?: number;
  doraIndicators?: TileId[];
  uraDoraIndicators?: TileId[];
  akaDoraCount?: number;
  useEvDecision?: boolean;
}

export interface NanikiruCandidate {
  discard: TileId;
  shanten: number;
  waits: TileInfo[];
  totalWaits: number;
  goodShapeCount: number;
  goodShapeDraws: TileId[];
  score: number;
  scoreBreakdown: NanikiruScoreBreakdown;
  reasons: Reason[];
  estimate?: RoundEstimate;
  riichiJudgment?: RiichiJudgment;
}

export interface NanikiruAnalysis {
  input: string;
  handText: string;
  hand: TileId[];
  calls: Call[];
  context: NanikiruContext;
  tileCount: number;
  shanten: number;
  isTenpai: boolean;
  isAgari: boolean;
  recommendation?: TileId;
  recommendedCandidate?: NanikiruCandidate;
  candidates?: NanikiruCandidate[];
  riichiPlanDecision?: RiichiPlanDecision;
  explanation: string;
  raw?: DiscardAnalysis["raw"];
}

export function parseNanikiruHandText(input: string): string {
  return parseHandText(input);
}

export function analyzeNanikiru(input: string | NanikiruInput, mode: ShantenMode = 0): NanikiruAnalysis {
  const request = typeof input === "string" ? { text: input, mode } : input;
  const handText = parseNanikiruHandText(request.text);
  const parsedHand = parseTileGroupsWithRed(handText);
  const context: NanikiruContext = {
    calls: request.calls,
    seatWind: request.seatWind,
    bakaze: request.bakaze,
    kyoku: request.kyoku,
    points: request.points,
    opponents: request.opponents,
    turn: request.turn,
    rules: request.rules ?? DEFAULT_RULE_CONFIG,
    honba: request.honba,
    riichiSticks: request.riichiSticks,
    doraIndicators: request.doraIndicators,
    uraDoraIndicators: request.uraDoraIndicators,
    akaDoraCount: parsedHand.akaDoraCount + (request.akaDoraCount ?? 0),
  };
  const analysisMode = isOpenHand(context) ? 1 : (request.mode ?? mode);
  const analysis = analyzeHandText({
    ...request,
    mode: analysisMode,
    includeRaw: request.includeRaw || request.verbose,
    unavailableTiles: getContextVisibleTiles(context),
  }, analysisMode);
  if (analysis.kind !== "discard") {
    throw new HandTextParseError(`${analysis.input}（当前为 ${analysis.tileCount} 张，不是需要切牌的 3n+2 手牌）`);
  }
  const policy = normalizeStrategyPolicy(request.policy);
  const evaluated = evaluateNanikiru(analysis, policy, context);
  applyEvDecision(evaluated, buildEstimateState(evaluated.hand, context), {
    enabled: request.useEvDecision ?? true,
    mode: "attack",
  });
  applyRiichiPlanDecision(evaluated);
  const explanation = renderNanikiruExplanation(evaluated);

  const result: NanikiruAnalysis = {
    input: evaluated.input,
    handText: evaluated.handText,
    hand: evaluated.hand,
    calls: context.calls ?? [],
    context,
    tileCount: evaluated.tileCount,
    shanten: evaluated.shanten,
    isTenpai: evaluated.isTenpai,
    isAgari: evaluated.isAgari,
    recommendation: evaluated.recommendation,
    recommendedCandidate: evaluated.candidates[0] ? toServiceCandidate(evaluated.candidates[0]) : undefined,
    riichiPlanDecision: evaluated.riichiPlanDecision,
    explanation,
  };
  if (request.verbose || request.includeCandidates) {
    result.candidates = evaluated.candidates.map(toServiceCandidate);
  }
  if (request.verbose || request.includeRaw) {
    result.raw = evaluated.raw;
  }
  return result;
}

export { HandTextParseError as NanikiruParseError };

function toServiceCandidate(candidate: EvaluatedNanikiruCandidate): NanikiruCandidate {
  return {
    discard: candidate.discard,
    shanten: candidate.shanten,
    waits: candidate.waits,
    totalWaits: candidate.totalWaits,
    goodShapeCount: candidate.goodShapeCount,
    goodShapeDraws: candidate.goodShapeDraws,
    score: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
    reasons: candidate.reasons,
    estimate: candidate.estimate,
    riichiJudgment: candidate.riichiJudgment,
  };
}

function buildEstimateState(hand: readonly TileId[], context: NanikiruContext): GameState {
  const self: PlayerState = {
    seatWind: context.seatWind ?? "1z",
    points: context.points ?? 25000,
    hand: [...hand],
    calls: context.calls ?? [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: (context.calls ?? []).every((call) => call.type === "ankan"),
  };
  const opponents: PlayerState[] = [
    makeDefaultOpponent("2z"),
    makeDefaultOpponent("3z"),
    makeDefaultOpponent("4z"),
  ];
  return {
    round: {
      bakaze: context.bakaze ?? "1z",
      kyoku: context.kyoku ?? 1,
      honba: context.honba ?? 0,
      riichiSticks: context.riichiSticks ?? 0,
      turn: context.turn ?? 8,
    },
    self,
    opponents,
    doraIndicators: context.doraIndicators ?? [],
    visibleTiles: context.visibleTiles ?? tilesToCounts34([
      ...hand,
      ...(context.calls ?? []).flatMap((call) => call.tiles),
      ...(context.doraIndicators ?? []),
    ]),
    rules: context.rules ?? DEFAULT_RULE_CONFIG,
  };
}

function makeDefaultOpponent(seatWind: WindTile): PlayerState {
  return {
    seatWind,
    points: 25000,
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  };
}
