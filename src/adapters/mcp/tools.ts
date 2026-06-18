import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { schemas } from "../../schemas/registry.ts";
import { executeTool, type MahjongToolName } from "../tools/execute.ts";

export interface MahjongMcpTool {
  name: MahjongToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export const mahjongMcpTools: MahjongMcpTool[] = [
  {
    name: "mahjong_analyze_hand",
    title: "Analyze Mahjong Hand",
    description: "分析立直麻将手牌的向听、进张或切牌候选。",
    inputSchema: schemas.analyzeHandRequest,
    outputSchema: schemas.toolOutputServiceResult,
  },
  {
    name: "mahjong_nanikiru",
    title: "Recommend Mahjong Discard",
    description: "根据手牌文本和可选上下文给出何切推荐、候选评分和中文解释。",
    inputSchema: schemas.nanikiruToolRequest,
    outputSchema: schemas.toolOutputServiceResult,
  },
  {
    name: "mahjong_score_hand",
    title: "Score Mahjong Hand",
    description: "计算立直麻将和牌的役种、符番和点数。",
    inputSchema: schemas.scoreHandRequest,
    outputSchema: schemas.toolOutputServiceResult,
  },
  {
    name: "mahjong_choose_action",
    title: "Choose Mahjong Action",
    description: "根据完整 GameState 推荐当前合法动作，并返回结构化结果和中文解释。",
    inputSchema: schemas.chooseActionToolRequest,
    outputSchema: schemas.toolOutputServiceResult,
  },
  {
    name: "mahjong_estimate",
    title: "Estimate Mahjong Round EV",
    description: "估算切牌或指定动作的和牌率、放铳率、预期点数和局收支。",
    inputSchema: schemas.estimateRequest,
    outputSchema: schemas.toolOutputServiceResult,
  },
  {
    name: "mahjong_parse_screenshot",
    title: "Parse Mahjong Screenshot",
    description: "解析麻将截图为局面状态。当前版本尚未实现，会返回 not_implemented。",
    inputSchema: schemas.parseScreenshotRequest,
    outputSchema: schemas.toolOutputServiceResult,
  },
];

export function registerMahjongMcpTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mahjongMcpTools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: {
        title: tool.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    })) as Tool[],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    return callMahjongMcpTool(request.params.name, request.params.arguments ?? {});
  });
}

export function callMahjongMcpTool(name: string, input: unknown): CallToolResult {
  const toolName = name as MahjongToolName;
  const known = mahjongMcpTools.some((tool) => tool.name === toolName);
  const result = known
    ? executeTool(toolName, input, "mcp")
    : {
      ok: false,
      error: {
        code: "invalid_input",
        message: `未知 MCP tool：${name}`,
        retryable: false,
      },
      warnings: [],
      meta: {
        apiVersion: "v1",
        engineVersion: "0.1.0",
        elapsedMs: 0,
        source: "mcp",
      },
    };
  return {
    content: [
      {
        type: "text",
        text: summarizeToolResult(result),
      },
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result as Record<string, unknown>,
    isError: !result.ok,
  };
}

function summarizeToolResult(result: { ok: boolean; data?: unknown; error?: { message: string } }): string {
  if (!result.ok) {
    return result.error?.message ?? "工具调用失败。";
  }
  const data = result.data as {
    recommendation?: string;
    action?: unknown;
    status?: string;
    explanation?: string;
  } | undefined;
  if (data?.explanation) {
    return data.explanation;
  }
  if (data?.recommendation) {
    return `推荐：${data.recommendation}`;
  }
  if (data?.action) {
    return `推荐动作：${JSON.stringify(data.action)}`;
  }
  if (data?.status) {
    return `状态：${data.status}`;
  }
  return "工具调用完成。";
}
