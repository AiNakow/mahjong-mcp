import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import { analyzeHandText, type DiscardAnalysis, type DiscardCandidate } from "./analyze.ts";
import { estimateRound, type EstimateMode, type RoundEstimate } from "../ev/index.ts";

export interface EstimateInput {
  state: GameState;
  mode?: EstimateMode;
  discard?: TileId;
  includeCandidates?: boolean;
}

export interface EstimateResult {
  mode: EstimateMode;
  estimates: RoundEstimate[];
  bestByRoundIncome?: RoundEstimate;
  analysis: {
    shanten: number;
    candidates: DiscardCandidate[];
  };
}

export function estimateDiscardActions(input: EstimateInput): EstimateResult {
  const mode = input.mode ?? "fast";
  const analysis = analyzeStateForDiscard(input.state);
  const candidates = input.discard
    ? analysis.candidates.filter((candidate) => candidate.discard === input.discard)
    : analysis.candidates;
  if (input.discard && candidates.length === 0) {
    throw new Error(`未找到切 ${input.discard} 的候选。`);
  }
  const estimates = candidates.map((candidate) => estimateRound({
    state: input.state,
    mode,
    action: { type: input.state.self.riichi ? "riichi-discard" : "discard", tile: candidate.discard },
    candidate,
    candidates: analysis.candidates,
  }));
  const bestByRoundIncome = [...estimates].sort((a, b) => (
    b.expectedRoundIncome.value - a.expectedRoundIncome.value
  ))[0];

  return {
    mode,
    estimates: input.includeCandidates ? estimates : estimates.slice(0, input.discard ? 1 : Math.min(5, estimates.length)),
    bestByRoundIncome,
    analysis: {
      shanten: analysis.shanten,
      candidates: analysis.candidates,
    },
  };
}

function analyzeStateForDiscard(state: GameState): DiscardAnalysis {
  const hand = [...(state.self.hand ?? []), ...(state.lastDraw ? [state.lastDraw] : [])];
  const analysis = analyzeHandText({
    text: hand.join(""),
    mode: state.self.calls.some((call) => call.type !== "ankan") ? 1 : 0,
    unavailableTiles: [
      ...state.doraIndicators,
      ...state.self.calls.flatMap((call) => call.tiles),
      ...state.opponents.flatMap((opponent) => [
        ...opponent.calls.flatMap((call) => call.tiles),
        ...opponent.discards.map((discard) => discard.tile),
      ]),
    ],
  });
  if (analysis.kind !== "discard") {
    throw new Error(`GameState self hand must contain a 3n+2 discard hand, got ${analysis.tileCount} tiles`);
  }
  return analysis;
}
