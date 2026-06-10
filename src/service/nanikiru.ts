import type { TileId } from "../core/tile.ts";
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
import type { Reason } from "../strategy/reason.ts";

export interface NanikiruInput {
  text: string;
  mode?: ShantenMode;
  policy?: Partial<NanikiruPolicy>;
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
  tileCount: number;
  shanten: number;
  isTenpai: boolean;
  isAgari: boolean;
  candidates: NanikiruCandidate[];
  recommendation?: TileId;
  explanation: string;
  raw: DiscardAnalysis["raw"];
}

export function parseNanikiruHandText(input: string): string {
  return parseHandText(input);
}

export function analyzeNanikiru(input: string | NanikiruInput, mode: ShantenMode = 0): NanikiruAnalysis {
  const analysis = analyzeHandText(input, mode);
  if (analysis.kind !== "discard") {
    throw new HandTextParseError(`${analysis.input}（当前为 ${analysis.tileCount} 张，不是需要切牌的 3n+2 手牌）`);
  }
  const request = typeof input === "string" ? { text: input, mode } : input;
  const policy = {
    ...DEFAULT_NANIKIRU_POLICY,
    ...request.policy,
  };
  const evaluated = evaluateNanikiru(analysis, policy);
  const explanation = renderNanikiruExplanation(evaluated);

  return {
    input: evaluated.input,
    handText: evaluated.handText,
    hand: evaluated.hand,
    tileCount: evaluated.tileCount,
    shanten: evaluated.shanten,
    isTenpai: evaluated.isTenpai,
    isAgari: evaluated.isAgari,
    candidates: evaluated.candidates.map(toServiceCandidate),
    recommendation: evaluated.recommendation,
    explanation,
    raw: evaluated.raw,
  };
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
