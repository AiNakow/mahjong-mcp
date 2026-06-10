import type { EvaluatedNanikiruAnalysis } from "../strategy/evaluate-nanikiru.ts";

export function renderNanikiruExplanation(analysis: EvaluatedNanikiruAnalysis): string {
  const best = analysis.candidates[0];
  if (!best) {
    return "当前没有可用切牌候选。";
  }

  const reasons = [...best.reasons]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  return [
    `推荐：切 ${best.discard}。`,
    "",
    "理由：",
    ...reasons.map((reason) => `- ${reason.message}`),
  ].join("\n");
}
