import type { GameState } from "../core/state.ts";
import { estimateRound, type RoundEstimate } from "../ev/index.ts";
import type { EvaluatedNanikiruAnalysis, EvaluatedNanikiruCandidate } from "./evaluate-nanikiru.ts";
import type { StrategyMode } from "./action-types.ts";

export interface EvDecisionOptions {
  enabled?: boolean;
  mode?: StrategyMode;
}

interface CandidateWithEv {
  candidate: EvaluatedNanikiruCandidate;
  estimate: RoundEstimate;
  originalScore: number;
}

const DEFAULT_MIN_INCOME_DELTA = 250;
const DEFAULT_RISK_INCOME_DELTA = 600;
const DEFAULT_RISK_RATE_DELTA = 0.05;

export function applyEvDecision(
  analysis: EvaluatedNanikiruAnalysis,
  state: GameState,
  options: EvDecisionOptions = {},
): void {
  if (options.enabled === false || analysis.candidates.length <= 1) {
    return;
  }

  const mode = options.mode ?? "attack";
  const withEv = analysis.candidates.map((candidate) => attachEstimate(candidate, analysis, state, mode));
  const reordered = reorderByEvDecisionBand(withEv, analysis.shanten, mode);
  analysis.candidates.splice(0, analysis.candidates.length, ...reordered.map((item) => item.candidate));
  analysis.recommendation = analysis.candidates[0]?.discard;
}

function attachEstimate(
  candidate: EvaluatedNanikiruCandidate,
  analysis: EvaluatedNanikiruAnalysis,
  state: GameState,
  mode: StrategyMode,
): CandidateWithEv {
  const previousEvScore = candidate.scoreBreakdown.ev ?? 0;
  const originalScore = candidate.score - previousEvScore;
  const estimate = estimateRound({
    state,
    mode: "fast",
    action: { type: state.self.riichi ? "riichi-discard" : "discard", tile: candidate.discard },
    candidate,
    candidates: analysis.candidates,
  });
  const evScore = calculateEvScore(estimate, mode);
  candidate.estimate = estimate;
  candidate.scoreBreakdown.ev = evScore;
  candidate.score = originalScore + evScore;
  return { candidate, estimate, originalScore };
}

function calculateEvScore(estimate: RoundEstimate, mode: StrategyMode): number {
  const weight = mode === "defense" ? 1.0 : mode === "balance" ? 0.7 : mode === "push" ? 0.5 : 0.4;
  return Math.round((estimate.expectedRoundIncome.value / 100) * weight * 10) / 10;
}

function reorderByEvDecisionBand(
  items: CandidateWithEv[],
  baseShanten: number,
  mode: StrategyMode,
): CandidateWithEv[] {
  const remaining = [...items];
  const result: CandidateWithEv[] = [];

  while (remaining.length > 0) {
    const anchor = remaining.shift();
    if (!anchor) {
      break;
    }
    const band = [anchor];
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const item = remaining[i];
      if (canShareEvDecisionBand(anchor, item, baseShanten)) {
        band.push(item);
        remaining.splice(i, 1);
      }
    }
    result.push(...sortBandByEv(band, mode));
  }

  return result;
}

function sortBandByEv(items: CandidateWithEv[], mode: StrategyMode): CandidateWithEv[] {
  const sorted = [...items].sort((a, b) => compareByEvProtection(a, b, mode));
  const winner = sorted[0];
  const originalBest = [...items].sort((a, b) => b.originalScore - a.originalScore)[0];
  if (winner && originalBest && winner.candidate.discard !== originalBest.candidate.discard) {
    addEvReason(winner, originalBest);
  }
  return sorted;
}

function compareByEvProtection(a: CandidateWithEv, b: CandidateWithEv, mode: StrategyMode): number {
  const riskOrder = compareRiskProtection(a, b);
  if (riskOrder !== 0) {
    return riskOrder;
  }

  const incomeDelta = a.estimate.expectedRoundIncome.value - b.estimate.expectedRoundIncome.value;
  const dealInDelta = a.estimate.dealInRate.value - b.estimate.dealInRate.value;
  if (
    (mode === "defense" || mode === "balance")
    && incomeDelta >= 400
    && dealInDelta <= 0
  ) {
    return -1;
  }
  if (
    (mode === "defense" || mode === "balance")
    && incomeDelta <= -400
    && dealInDelta >= 0
  ) {
    return 1;
  }

  if (Math.abs(incomeDelta) >= DEFAULT_MIN_INCOME_DELTA && hasUsableConfidence(a, b)) {
    return incomeDelta > 0 ? -1 : 1;
  }
  return b.candidate.score - a.candidate.score
    || b.originalScore - a.originalScore
    || b.candidate.totalWaits - a.candidate.totalWaits;
}

function compareRiskProtection(a: CandidateWithEv, b: CandidateWithEv): number {
  const aRiskier = isClearlyRiskierAndWorse(a, b);
  const bRiskier = isClearlyRiskierAndWorse(b, a);
  if (aRiskier && !bRiskier) {
    return 1;
  }
  if (bRiskier && !aRiskier) {
    return -1;
  }
  return 0;
}

function isClearlyRiskierAndWorse(a: CandidateWithEv, b: CandidateWithEv): boolean {
  return a.estimate.dealInRate.value >= b.estimate.dealInRate.value + DEFAULT_RISK_RATE_DELTA
    && a.estimate.expectedRoundIncome.value <= b.estimate.expectedRoundIncome.value - DEFAULT_RISK_INCOME_DELTA;
}

function canShareEvDecisionBand(a: CandidateWithEv, b: CandidateWithEv, baseShanten: number): boolean {
  if (!isSameDecisionClass(a.candidate, b.candidate, baseShanten)) {
    return false;
  }
  if (!hasUsableConfidence(a, b)) {
    return false;
  }
  const scoreDelta = Math.abs(a.originalScore - b.originalScore);
  const band = Math.max(60, Math.max(Math.abs(a.originalScore), Math.abs(b.originalScore)) * 0.12);
  return scoreDelta <= band;
}

function isSameDecisionClass(
  a: EvaluatedNanikiruCandidate,
  b: EvaluatedNanikiruCandidate,
  baseShanten: number,
): boolean {
  if (a.shanten === b.shanten) {
    return true;
  }
  return a.shanten > baseShanten
    && b.shanten > baseShanten
    && a.scoreBreakdown.defense > 0
    && b.scoreBreakdown.defense > 0;
}

function hasUsableConfidence(a: CandidateWithEv, b: CandidateWithEv): boolean {
  return a.estimate.confidence !== "low" || b.estimate.confidence !== "low";
}

function addEvReason(winner: CandidateWithEv, originalBest: CandidateWithEv): void {
  const incomeDelta = winner.estimate.expectedRoundIncome.value - originalBest.estimate.expectedRoundIncome.value;
  const dealInDelta = winner.estimate.dealInRate.value - originalBest.estimate.dealInRate.value;
  winner.candidate.reasons.push({
    type: "ev",
    polarity: "positive",
    priority: 93,
    message: `原策略分接近时，切 ${winner.candidate.discard} 的局收支估算比切 ${originalBest.candidate.discard} 高约 ${Math.round(incomeDelta)} 点，因此优先。`,
    data: {
      discard: winner.candidate.discard,
      secondDiscard: originalBest.candidate.discard,
      expectedRoundIncome: winner.estimate.expectedRoundIncome.value,
      secondExpectedRoundIncome: originalBest.estimate.expectedRoundIncome.value,
      incomeDelta,
      dealInRate: winner.estimate.dealInRate.value,
      secondDealInRate: originalBest.estimate.dealInRate.value,
      dealInDelta,
    },
  });
}
