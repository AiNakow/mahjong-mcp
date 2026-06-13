import type { EvaluatedAction } from "./action-types.ts";

const CATEGORY_BASE: Record<EvaluatedAction["category"], number> = {
  agari: 100000,
  riichi: 1000,
  discard: 0,
  call: 0,
  kan: -100,
  pass: 0,
};

export function getActionFinalScore(candidate: EvaluatedAction): number {
  return CATEGORY_BASE[candidate.category] + candidate.score;
}

export function arbitrateActions(candidates: readonly EvaluatedAction[]): EvaluatedAction | undefined {
  return candidates
    .filter((candidate) => candidate.legal)
    .sort(compareEvaluatedActions)[0];
}

export function compareEvaluatedActions(a: EvaluatedAction, b: EvaluatedAction): number {
  return getActionFinalScore(b) - getActionFinalScore(a)
    || b.priority - a.priority
    || getDefenseScore(b) - getDefenseScore(a);
}

function getDefenseScore(candidate: EvaluatedAction): number {
  return candidate.scoreBreakdown.defense ?? 0;
}
