import { decomposeAgari } from "./decompose.ts";
import { calculateFu } from "./fu.ts";
import { calculatePoints } from "./points.ts";
import type { AgariContext, AgariDecomposition, ScoreCandidate, ScoreWarning } from "./types.ts";
import { hasContextError, validateAgariContext } from "./validation.ts";
import { evaluateYaku } from "./yaku.ts";

export type AgariScoreStatus = "invalid_context" | "not_agari" | "no_yaku" | "scored";

export interface AgariScoreResult {
  status: AgariScoreStatus;
  warnings: ScoreWarning[];
  decompositions: AgariDecomposition[];
  candidates: ScoreCandidate[];
  best?: ScoreCandidate;
}

export function calculateAgariScore(context: AgariContext): AgariScoreResult {
  const warnings = validateAgariContext(context);
  if (hasContextError(warnings)) {
    return {
      status: "invalid_context",
      warnings,
      decompositions: [],
      candidates: [],
    };
  }

  const decompositions = decomposeAgari(context.hand, context.winningTile, context.calls ?? []);
  const candidates: ScoreCandidate[] = [];

  for (const decomposition of decompositions) {
    const yaku = evaluateYaku(context, decomposition);
    if (yaku.length === 0) {
      continue;
    }

    const yakuman = yaku.reduce((total, item) => total + (item.yakuman ?? 0), 0);
    const effectiveYaku = yakuman > 0 ? yaku.filter((item) => item.yakuman) : yaku;
    const han = yakuman > 0 ? 0 : effectiveYaku.reduce((total, item) => total + item.han, 0);
    const fu = yakuman > 0 ? 0 : calculateFu(context, decomposition);
    const points = calculatePoints(context, han, fu, yakuman);

    candidates.push({
      decomposition,
      yaku: effectiveYaku,
      han,
      fu,
      points,
    });
  }

  candidates.sort((a, b) => (
    b.points.total - a.points.total
    || b.han - a.han
    || b.fu - a.fu
  ));

  return {
    status: getScoreStatus(decompositions, candidates),
    warnings,
    decompositions,
    candidates,
    best: candidates[0],
  };
}

function getScoreStatus(
  decompositions: readonly AgariDecomposition[],
  candidates: readonly ScoreCandidate[],
): AgariScoreStatus {
  if (decompositions.length === 0) {
    return "not_agari";
  }
  if (candidates.length === 0) {
    return "no_yaku";
  }
  return "scored";
}
