import { readFileSync } from "node:fs";
import { executeTool, type MahjongToolName } from "../adapters/tools/execute.ts";

const TOOL_BY_COMMAND: Record<string, MahjongToolName> = {
  "analyze-hand": "mahjong_analyze_hand",
  nanikiru: "mahjong_nanikiru",
  "score-hand": "mahjong_score_hand",
  "choose-action": "mahjong_choose_action",
  estimate: "mahjong_estimate",
  "parse-screenshot": "mahjong_parse_screenshot",
};

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || !(command in TOOL_BY_COMMAND)) {
    throw new Error(`命令必须是：${Object.keys(TOOL_BY_COMMAND).join(", ")}`);
  }
  const inputPath = getOption(args, "--input");
  const jsonValue = inputPath
    ? readFileSync(inputPath, "utf8")
    : getOption(args, "--json");
  if (!jsonValue) {
    throw new Error("缺少 --input <request.json> 或 --json '<request>'。");
  }
  const request = JSON.parse(jsonValue) as unknown;
  const result = executeTool(TOOL_BY_COMMAND[command]!, request, "cli");
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function getOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

