import type { Reason } from "../reason.ts";

export interface EvaluationPart {
  score: number;
  reasons: Reason[];
}
