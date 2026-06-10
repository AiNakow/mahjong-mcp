import type { TileId } from "../core/tile.ts";
import type { TileInfo } from "../hand/paili.ts";
import type { DiscardAnalysis, DiscardCandidate } from "../service/analyze.ts";
import { evaluateShape } from "./evaluators/evaluate-shape.ts";
import { evaluateValuePotential } from "./evaluators/evaluate-value.ts";
import type { NanikiruPolicy } from "./nanikiru-policy.ts";
import { DEFAULT_NANIKIRU_POLICY } from "./nanikiru-policy.ts";
import type { Reason } from "./reason.ts";

export interface NanikiruScoreBreakdown {
  shanten: number;
  ukeire: number;
  goodShape: number;
  shape: number;
  value: number;
}

export interface EvaluatedNanikiruCandidate extends DiscardCandidate {
  score: number;
  scoreBreakdown: NanikiruScoreBreakdown;
  reasons: Reason[];
}

export interface EvaluatedNanikiruAnalysis {
  input: string;
  handText: string;
  hand: TileId[];
  tileCount: number;
  shanten: number;
  isTenpai: boolean;
  isAgari: boolean;
  candidates: EvaluatedNanikiruCandidate[];
  recommendation?: TileId;
  raw: DiscardAnalysis["raw"];
}

export function evaluateNanikiru(
  analysis: DiscardAnalysis,
  policy: NanikiruPolicy = DEFAULT_NANIKIRU_POLICY,
): EvaluatedNanikiruAnalysis {
  const evaluated = analysis.candidates
    .map((candidate) => evaluateCandidate(analysis, candidate, policy))
    .sort((a, b) => b.score - a.score || b.totalWaits - a.totalWaits);

  addComparativeReasons(evaluated);

  return {
    input: analysis.input,
    handText: analysis.handText,
    hand: analysis.hand,
    tileCount: analysis.tileCount,
    shanten: analysis.shanten,
    isTenpai: analysis.isTenpai,
    isAgari: analysis.isAgari,
    candidates: evaluated,
    recommendation: evaluated[0]?.discard,
    raw: analysis.raw,
  };
}

function evaluateCandidate(
  analysis: DiscardAnalysis,
  candidate: DiscardCandidate,
  policy: NanikiruPolicy,
): EvaluatedNanikiruCandidate {
  const afterDiscard = removeOneTile(analysis.hand, candidate.discard);
  const reasons: Reason[] = [];

  const shantenScore = -candidate.shanten * policy.shantenWeight;
  reasons.push({
    type: "shanten",
    polarity: candidate.shanten <= analysis.shanten ? "neutral" : "negative",
    priority: 70,
    message: `切 ${candidate.discard} 后为 ${formatShanten(candidate.shanten)}。`,
    data: { discard: candidate.discard, shanten: candidate.shanten },
  });

  const ukeireScore = candidate.totalWaits * policy.ukeireWeight;
  reasons.push({
    type: "ukeire",
    polarity: "positive",
    priority: 90,
    message: `切 ${candidate.discard} 后总进张 ${candidate.totalWaits} 枚。`,
    data: { discard: candidate.discard, totalWaits: candidate.totalWaits },
  });

  const goodShapeScore = candidate.goodShapeCount * policy.goodShapeWeight;
  if (candidate.goodShapeCount > 0) {
    reasons.push({
      type: "good_shape",
      polarity: "positive",
      priority: 75,
      message: `其中好形相关进张 ${candidate.goodShapeCount} 枚。`,
      data: {
        discard: candidate.discard,
        goodShapeCount: candidate.goodShapeCount,
        goodShapeDraws: candidate.goodShapeDraws,
      },
    });
  }

  const shapeEvaluation = evaluateShape(afterDiscard, candidate);
  const valueEvaluation = evaluateValuePotential(afterDiscard, candidate.discard, policy);

  const scoreBreakdown: NanikiruScoreBreakdown = {
    shanten: shantenScore,
    ukeire: ukeireScore,
    goodShape: goodShapeScore,
    shape: shapeEvaluation.score * policy.shapeWeight,
    value: valueEvaluation.score * policy.valueWeight,
  };

  const score = Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);

  return {
    ...candidate,
    score,
    scoreBreakdown,
    reasons: [
      ...reasons,
      ...shapeEvaluation.reasons,
      ...valueEvaluation.reasons,
    ],
  };
}

function addComparativeReasons(candidates: EvaluatedNanikiruCandidate[]): void {
  const best = candidates[0];
  const second = candidates[1];
  if (!best || !second) {
    return;
  }

  if (best.totalWaits > second.totalWaits) {
    best.reasons.push({
      type: "ukeire",
      polarity: "positive",
      priority: 95,
      message: `相比切 ${second.discard} 的 ${second.totalWaits} 枚，切 ${best.discard} 的进张更多。`,
      data: {
        discard: best.discard,
        secondDiscard: second.discard,
        totalWaits: best.totalWaits,
        secondTotalWaits: second.totalWaits,
      },
    });
  }
}

function removeOneTile(tiles: readonly TileId[], tile: TileId): TileId[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) {
    result.splice(index, 1);
  }
  return result;
}

function formatShanten(shanten: number): string {
  if (shanten < 0) {
    return "已和牌";
  }
  if (shanten === 0) {
    return "听牌";
  }
  return `${shanten} 向听`;
}

export function formatWaits(waits: readonly TileInfo[]): string {
  return waits.map((wait) => `${wait.id}(${wait.remaining})`).join("、");
}
