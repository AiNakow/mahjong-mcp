import { schemas } from "../../schemas/registry.ts";
import { executeTool, type MahjongToolName } from "./execute.ts";

export const anthropicTools = [
  {
    name: "mahjong_analyze_hand",
    description: "分析立直麻将手牌的向听、进张或切牌候选。",
    input_schema: schemas.analyzeHandRequest,
  },
  {
    name: "mahjong_nanikiru",
    description: "根据手牌文本和可选上下文给出何切推荐、候选评分和中文解释。",
    input_schema: schemas.nanikiruRequest,
  },
  {
    name: "mahjong_score_hand",
    description: "计算立直麻将和牌的役种、符番和点数。",
    input_schema: schemas.scoreHandRequest,
  },
  {
    name: "mahjong_choose_action",
    description: "根据完整 GameState 推荐当前合法动作，并返回结构化结果和中文解释。",
    input_schema: schemas.chooseActionRequest,
  },
  {
    name: "mahjong_estimate",
    description: "估算切牌或指定动作的和牌率、放铳率、预期点数和局收支。",
    input_schema: schemas.estimateRequest,
  },
  {
    name: "mahjong_parse_screenshot",
    description: "解析麻将截图为局面状态。当前版本尚未实现，会返回 not_implemented。",
    input_schema: schemas.parseScreenshotRequest,
  },
] as const;

export function executeAnthropicTool(name: MahjongToolName, input: unknown) {
  return executeTool(name, input, "anthropic_tool");
}

