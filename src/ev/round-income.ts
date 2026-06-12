import type { GameState } from "../core/state.ts";
import type { PointEstimate, ProbabilityEstimate, RoundIncomeBreakdown } from "./types.ts";
import type { HandValueDistribution, OpponentEstimate } from "./types.ts";
import { clampProbability } from "./wall-model.ts";

export interface RoundIncomeInput {
  state: GameState;
  actionType: "discard" | "riichi-discard";
  winRate: ProbabilityEstimate;
  dealInRate: ProbabilityEstimate;
  handValue: HandValueDistribution;
  opponents: readonly OpponentEstimate[];
  isTenpai: boolean;
}

export interface RoundIncomeResult {
  expectedRoundIncome: PointEstimate;
  expectedAgariPoints: PointEstimate;
  breakdown: RoundIncomeBreakdown;
}

export function estimateRoundIncome(input: RoundIncomeInput): RoundIncomeResult {
  const selfRonRate = input.winRate.value * 0.48;
  const selfTsumoRate = input.winRate.value * 0.52;
  const dealInRate = input.dealInRate.value;
  const opponentTsumoRate = clampProbability(
    input.opponents.reduce((total, opponent) => total + opponent.tsumoRate, 0) * (1 - input.winRate.value),
  );
  const otherRonRate = clampProbability(
    input.opponents.reduce((total, opponent) => total + opponent.winRate * 0.22, 0) * (1 - input.winRate.value),
  );
  const drawRate = Math.max(0, 1 - selfRonRate - selfTsumoRate - dealInRate - opponentTsumoRate - otherRonRate);
  const averageDealInLoss = weightedAverage(input.opponents.map((opponent) => opponent.expectedRonValue), 5200);
  const averageTsumoLoss = weightedAverage(input.opponents.map((opponent) => opponent.expectedTsumoLossToActor), 2600);
  const honbaIncome = input.state.round.honba * 300 * input.winRate.value;
  const riichiStickCost = input.actionType === "riichi-discard" || input.state.self.riichi ? -1000 : 0;
  const riichiStickReturn = (input.state.round.riichiSticks * 1000 + (riichiStickCost < 0 ? 1000 : 0)) * input.winRate.value;
  const drawDelta = estimateExhaustiveDrawDelta(input.isTenpai) * drawRate;

  const breakdown: RoundIncomeBreakdown = {
    selfRon: selfRonRate * input.handValue.averageRon,
    selfTsumo: selfTsumoRate * input.handValue.averageTsumoGain,
    dealIn: -dealInRate * averageDealInLoss,
    opponentTsumoLoss: -opponentTsumoRate * averageTsumoLoss,
    otherRonLoss: 0 * otherRonRate,
    exhaustiveDraw: drawDelta,
    riichiStick: riichiStickCost + riichiStickReturn,
    honba: honbaIncome,
  };
  const total = Object.values(breakdown).reduce((sum, value) => sum + (value ?? 0), 0);

  return {
    expectedAgariPoints: {
      value: Math.round(input.handValue.averageRon * 0.48 + input.handValue.averageTsumoGain * 0.52),
      confidence: "low",
      reasons: input.handValue.reasons,
    },
    expectedRoundIncome: {
      value: Math.round(total),
      confidence: "low",
      reasons: [
        "按自家荣和、自摸、放铳、被自摸、横移和流局概率加权合成。",
        ...(riichiStickCost < 0 ? ["立直动作先扣 1000 点，并在自家和牌时按供托回收。"] : []),
      ],
    },
    breakdown: roundBreakdown(breakdown),
  };
}

function estimateExhaustiveDrawDelta(isTenpai: boolean): number {
  return isTenpai ? 1200 : -1000;
}

function weightedAverage(values: readonly number[], fallback: number): number {
  if (values.length === 0) {
    return fallback;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundBreakdown(breakdown: RoundIncomeBreakdown): RoundIncomeBreakdown {
  return {
    selfRon: Math.round(breakdown.selfRon),
    selfTsumo: Math.round(breakdown.selfTsumo),
    dealIn: Math.round(breakdown.dealIn),
    opponentTsumoLoss: Math.round(breakdown.opponentTsumoLoss),
    otherRonLoss: Math.round(breakdown.otherRonLoss),
    exhaustiveDraw: Math.round(breakdown.exhaustiveDraw),
    riichiStick: Math.round(breakdown.riichiStick),
    honba: Math.round(breakdown.honba),
    placementBonus: breakdown.placementBonus === undefined ? undefined : Math.round(breakdown.placementBonus),
  };
}
