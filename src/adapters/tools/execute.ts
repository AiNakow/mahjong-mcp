import {
  analyzeHandRequest,
  analyzeNanikiruRequest,
  chooseActionRequest,
  estimateRequest,
  parseScreenshotRequest,
  scoreHandRequest,
} from "../../service/facade.ts";
import type { ServiceResult, ServiceSource } from "../../service/responses.ts";

export type MahjongToolName =
  | "mahjong_analyze_hand"
  | "mahjong_nanikiru"
  | "mahjong_score_hand"
  | "mahjong_choose_action"
  | "mahjong_estimate"
  | "mahjong_parse_screenshot";

export function executeTool(
  name: MahjongToolName,
  input: unknown,
  source: ServiceSource = "library",
): ServiceResult<unknown> {
  if (name === "mahjong_analyze_hand") {
    return analyzeHandRequest(input as never, { source });
  }
  if (name === "mahjong_nanikiru") {
    return analyzeNanikiruRequest(input as never, { source });
  }
  if (name === "mahjong_score_hand") {
    return scoreHandRequest(input as never, { source });
  }
  if (name === "mahjong_choose_action") {
    return chooseActionRequest(input as never, { source });
  }
  if (name === "mahjong_estimate") {
    return estimateRequest(input as never, { source });
  }
  return parseScreenshotRequest(input as never, { source });
}

