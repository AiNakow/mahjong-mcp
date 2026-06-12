import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import type { DiscardCandidate } from "../service/analyze.ts";

export type EstimateMode = "fast" | "balanced" | "deep";
export type EstimateObjective = "point" | "placement";
export type Confidence = "low" | "medium" | "high";

export interface CandidateAction {
  type: "discard" | "riichi-discard";
  tile: TileId;
}

export interface EstimateAssumptions {
  remainingDraws?: number;
  unknownWallSize?: number;
  visibleTiles?: readonly number[];
  riichiStickCost?: boolean;
}

export interface EstimateRoundInput {
  state: GameState;
  actor?: "self";
  action: CandidateAction;
  candidate?: DiscardCandidate;
  candidates?: readonly DiscardCandidate[];
  mode?: EstimateMode;
  objective?: EstimateObjective;
  assumptions?: EstimateAssumptions;
}

export interface ProbabilityEstimate {
  value: number;
  confidence: Confidence;
  reasons: string[];
}

export interface PointEstimate {
  value: number;
  confidence: Confidence;
  reasons: string[];
}

export interface RoundIncomeBreakdown {
  selfRon: number;
  selfTsumo: number;
  dealIn: number;
  opponentTsumoLoss: number;
  otherRonLoss: number;
  exhaustiveDraw: number;
  riichiStick: number;
  honba: number;
  placementBonus?: number;
}

export interface HandValueDistribution {
  ron: Array<{ points: number; probability: number }>;
  tsumo: Array<{ gain: number; probability: number }>;
  averageRon: number;
  averageTsumoGain: number;
  manganRate: number;
  limitHandRate: number;
  reasons: string[];
}

export interface DealInEstimate {
  immediateRate: ProbabilityEstimate;
  futurePushRate: ProbabilityEstimate;
  futureFoldRate: ProbabilityEstimate;
  combinedPushRate: ProbabilityEstimate;
}

export interface OpponentEstimate {
  tenpaiRate: number;
  winRate: number;
  tsumoRate: number;
  ronRateAgainstActor: number;
  expectedRonValue: number;
  expectedTsumoLossToActor: number;
  pushAgainstRiichiRate: number;
}

export interface RoundEstimate {
  action: CandidateAction;
  winRate: ProbabilityEstimate;
  dealInRate: ProbabilityEstimate;
  expectedAgariPoints: PointEstimate;
  expectedRoundIncome: PointEstimate;
  breakdown: RoundIncomeBreakdown;
  confidence: Confidence;
  assumptions: string[];
  warnings: string[];
}
