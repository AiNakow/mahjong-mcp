import { analyzeNanikiru, NanikiruParseError } from "./nanikiru.ts";
import type { ShantenMode } from "../hand/paili.ts";

declare const process: {
  argv: string[];
  exitCode?: number;
};

const text = process.argv[2] ?? "3456m3455p123788s";
const mode = Number(process.argv[3] ?? 0) as ShantenMode;
const verbose = process.argv.includes("--verbose");

try {
  const result = analyzeNanikiru({ text, mode, verbose });
  console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof NanikiruParseError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
