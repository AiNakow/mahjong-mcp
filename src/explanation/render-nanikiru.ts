import type { EvaluatedNanikiruAnalysis } from "../strategy/evaluate-nanikiru.ts";
import type { Reason } from "../strategy/reason.ts";

export function renderNanikiruExplanation(analysis: EvaluatedNanikiruAnalysis): string {
  const best = analysis.candidates[0];
  if (!best) {
    return "当前没有可用切牌候选。";
  }

  const reasons = normalizeReasonPriorities(best.reasons)
    .filter((reason) => reason.polarity !== "negative")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);
  const warnings = best.reasons.filter((reason) => reason.polarity === "negative");

  const lines = [
    `推荐：切 ${best.discard}。`,
    "",
    "理由：",
    ...reasons.map((reason) => `- ${reason.message}`),
  ];

  if (warnings.length > 0) {
    lines.push("", "注意：", ...warnings.map((reason) => `- ${reason.message}`));
  }
  if (best.riichiJudgment) {
    lines.push(
      "",
      "立直判断：",
      `- ${best.riichiJudgment.levelText}（${best.riichiJudgment.score}/100）。`,
      ...best.riichiJudgment.reasons.slice(0, 3).map((reason) => `- ${reason}`),
    );
  }
  if (analysis.riichiPlanDecision) {
    lines.push(
      "",
      "路线判断：",
      ...analysis.riichiPlanDecision.reasons.map((reason) => `- ${reason}`),
    );
  }

  return lines.join("\n");
}

export function normalizeReasonPriorities(reasons: readonly Reason[]): Reason[] {
  return reasons.map((reason) => {
    const points = getReasonPoints(reason);
    if (reason.type !== "highPoints" && reason.data?.highPoints !== true && points < 7700) {
      return reason;
    }

    return {
      ...reason,
      priority: getHighPointsPriority(points, reason.priority),
    };
  });
}

function getReasonPoints(reason: Reason): number {
  const averagePoints = reason.data?.averagePoints;
  if (typeof averagePoints === "number") {
    return averagePoints;
  }
  const bestTotal = reason.data?.bestTotal;
  if (typeof bestTotal === "number") {
    return bestTotal;
  }
  return 0;
}

function getHighPointsPriority(points: number, fallbackPriority: number): number {
  if (points >= 12000) {
    return 92;
  }
  if (points >= 7700) {
    return 86;
  }
  return Math.max(fallbackPriority, 64);
}
