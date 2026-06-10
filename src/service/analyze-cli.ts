import { analyzeHandText } from "./analyze.ts";
import { HandTextParseError } from "./parse-hand.ts";
import type { ShantenMode } from "../hand/paili.ts";

declare const process: {
  argv: string[];
  exitCode?: number;
};

const text = process.argv[2] ?? "123m456p789s1z";
const mode = Number(process.argv[3] ?? 0) as ShantenMode;

try {
  const result = analyzeHandText({ text, mode });
  console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof HandTextParseError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
