import { analyzeHand, MahjongHandError, type ShantenMode } from "./paili.ts";

declare const process: {
  argv: string[];
  exitCode?: number;
};

const handStr = process.argv[2] ?? "3456m3455p123788s";
const mode = Number(process.argv[3] ?? 0) as ShantenMode;
const start = performance.now();

try {
  const result = analyzeHand(handStr, mode);
  const elapsed = (performance.now() - start) / 1000;
  console.log(JSON.stringify(result));
  console.log(`Calculation time: ${elapsed.toFixed(6)}s`);
} catch (error) {
  if (error instanceof MahjongHandError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
