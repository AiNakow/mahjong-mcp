import type { DecisionPhase, EvaluatedAction } from "./action-types.ts";
import type { EvaluatedNanikiruAnalysis, EvaluatedNanikiruCandidate } from "./evaluate-nanikiru.ts";
import type { GameState } from "../core/state.ts";
import type { TileId } from "../core/tile.ts";
import type { LegalAction } from "./legal-actions.ts";

export function discardAnalysisToActions(
  analysis: EvaluatedNanikiruAnalysis,
  phase: DecisionPhase,
  legalActions?: readonly LegalAction[],
): EvaluatedAction[] {
  const legalDiscardTiles = getLegalDiscardTiles(legalActions);
  return analysis.candidates
    .filter((candidate) => !legalActions || legalDiscardTiles.has(candidate.discard))
    .map((candidate) => discardCandidateToAction(candidate, phase));
}

export function riichiAnalysisToActions(
  analysis: EvaluatedNanikiruAnalysis,
  phase: DecisionPhase,
  state: GameState,
  legalActions?: readonly LegalAction[],
): EvaluatedAction[] {
  if (!canDeclareRiichi(state)) {
    return [];
  }
  const legalRiichiTiles = getLegalRiichiTiles(legalActions);
  if (legalActions && legalRiichiTiles.size === 0) {
    return [];
  }
  return analysis.candidates
    .filter((candidate) => (
      candidate.shanten === 0
      && candidate.riichiJudgment?.canRiichi
      && candidate.riichiJudgment.shouldRiichi
      && (!legalActions || legalRiichiTiles.has(candidate.discard))
    ))
    .map((candidate) => riichiCandidateToAction(candidate, phase));
}

function getLegalRiichiTiles(legalActions: readonly LegalAction[] | undefined): Set<TileId> {
  return new Set(
    (legalActions ?? [])
      .flatMap((item) => item.action.type === "riichi" ? [item.action.tile] : []),
  );
}

function getLegalDiscardTiles(legalActions: readonly LegalAction[] | undefined): Set<TileId> {
  return new Set(
    (legalActions ?? [])
      .flatMap((item) => item.action.type === "discard" ? [item.action.tile] : []),
  );
}

function discardCandidateToAction(
  candidate: EvaluatedNanikiruCandidate,
  phase: DecisionPhase,
): EvaluatedAction {
  const warnings = candidate.reasons.filter((reason) => reason.polarity === "negative");
  return {
    action: { type: "discard", tile: candidate.discard },
    phase,
    legal: true,
    score: candidate.score,
    priority: 0,
    category: "discard",
    scoreBreakdown: {
      speed: candidate.scoreBreakdown.shanten
        + candidate.scoreBreakdown.ukeire
        + candidate.scoreBreakdown.goodShape
        + candidate.scoreBreakdown.shape
        + candidate.scoreBreakdown.route
        + candidate.scoreBreakdown.improvement,
      value: candidate.scoreBreakdown.value,
      defense: candidate.scoreBreakdown.defense,
      ev: candidate.scoreBreakdown.ev,
    },
    estimate: candidate.estimate,
    reasons: candidate.reasons,
    warnings,
    source: candidate,
  };
}

function riichiCandidateToAction(
  candidate: EvaluatedNanikiruCandidate,
  phase: DecisionPhase,
): EvaluatedAction {
  const judgment = candidate.riichiJudgment;
  const riichiScore = judgment?.score ?? 0;
  const reasons = [
    ...candidate.reasons,
    ...(judgment ? [{
      type: "riichi" as const,
      polarity: "positive" as const,
      priority: 96,
      message: `切 ${candidate.discard} 立直：${judgment.levelText}（${judgment.score}/100）。`,
      data: {
        discard: candidate.discard,
        riichiScore: judgment.score,
      },
    }] : []),
  ];
  return {
    action: { type: "riichi", tile: candidate.discard },
    phase,
    legal: true,
    score: candidate.score + riichiScore,
    priority: 50,
    category: "riichi",
    scoreBreakdown: {
      speed: candidate.scoreBreakdown.shanten
        + candidate.scoreBreakdown.ukeire
        + candidate.scoreBreakdown.goodShape
        + candidate.scoreBreakdown.shape
        + candidate.scoreBreakdown.route
        + candidate.scoreBreakdown.improvement,
      value: candidate.scoreBreakdown.value + riichiScore,
      defense: candidate.scoreBreakdown.defense,
      ev: candidate.scoreBreakdown.ev,
    },
    estimate: candidate.estimate,
    reasons,
    warnings: reasons.filter((reason) => reason.polarity === "negative"),
    source: candidate,
  };
}

function canDeclareRiichi(state: GameState): boolean {
  return state.self.menzen
    && !state.self.riichi
    && state.self.points >= 1000
    && state.round.turn < 18;
}
