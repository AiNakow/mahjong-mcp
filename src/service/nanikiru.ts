import type { TileId, WindTile } from "../core/tile.ts";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../core/rules.ts";
import { parseTileGroupsWithRed } from "../core/tile.ts";
import { renderNanikiruExplanation } from "../explanation/render-nanikiru.ts";
import {
  type ShantenMode,
  type TileInfo,
} from "../hand/paili.ts";
import { analyzeHandText, type DiscardAnalysis } from "./analyze.ts";
import { HandTextParseError, parseHandText } from "./parse-hand.ts";
import {
  evaluateNanikiru,
  type EvaluatedNanikiruCandidate,
  type NanikiruScoreBreakdown,
} from "../strategy/evaluate-nanikiru.ts";
import {
  DEFAULT_NANIKIRU_POLICY,
  type NanikiruPolicy,
} from "../strategy/nanikiru-policy.ts";
import {
  getContextVisibleTiles,
  isOpenHand,
  type NanikiruContext,
} from "../strategy/nanikiru-context.ts";
import type { Reason } from "../strategy/reason.ts";
import type { Call } from "../core/state.ts";

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
  rules?: RuleConfig;
  honba?: number;
  riichiSticks?: number;
  doraIndicators?: TileId[];
  uraDoraIndicators?: TileId[];
  akaDoraCount?: number;
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
  const policy = {
    ...DEFAULT_NANIKIRU_POLICY,
    ...request.policy,
  };
  const evaluated = evaluateNanikiru(analysis, policy, context);
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
  };
}
