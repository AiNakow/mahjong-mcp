# Mahjong AI

Mahjong AI 是一个 TypeScript 项目，目标是构建可复用的立直麻将分析引擎，并在后续通过 CLI、HTTP API、MCP 和工具 schema 暴露给现代 Agent 使用。

当前实现聚焦在牌理基础能力：牌解析、34 维计数转换、向听数、进张和切牌候选分析。它目前还不是完整的麻将对局 Agent。

## 当前能力

- 紧凑立直麻将牌编码：
  - `1m-9m`：万子
  - `1p-9p`：饼子
  - `1s-9s`：索子
  - `1z-7z`：东、南、西、北、白、发、中
- 手牌字符串解析和校验。
- `Counts34` 转换辅助函数。
- 基于分块 DP 的一般形向听计算。
- 七对子和国士无双向听计算。
- 摸牌型进张分析。
- 切牌候选分析和总进张数统计。
- 一向听场景的基础好形进张统计。
- 通用手牌分析服务，支持：
  - `3n+1` 手牌：分析当前向听、进张和听牌状态。
  - `3n+2` 手牌：分析所有可切牌候选和推荐切牌，包括向听后退候选。
- 最小何切服务层，支持从纯手牌字符串或 `手牌: ...` 文本中提取手牌并输出统一分析结构。
- 基础何切评分层，按 `score` 推荐切牌，并返回 `scoreBreakdown` 和 `reasons`。
- shape/value evaluator 已拆分；shape evaluator 支持基础两面、嵌张、边张、复合形和孤立幺九字牌识别。
- value evaluator 使用路线评分模型，按主路线全额计分、最佳次路线折扣计分，并支持断幺与役牌路线冲突衰减。
- value evaluator 支持“拆役牌对子转断幺”的启发式，在中张延展明显更好的牌形中避免机械保留役牌对子。
- 基础何切解释层，将高优先级 reasons 渲染为中文解释。
- 简单的牌理 CLI。
- 使用 Node 内置测试框架覆盖当前行为。

## 尚未实现

- 基于完整 `GameState` 的动作选择。
- 和牌分解。
- 役种判断。
- 符和点数计算。
- 宝牌相关的打点评估。
- 完整局面策略评分。
- 副露、立直、防守和排名判断。
- 截图识别。
- 自然语言何切题解析。
- HTTP API。
- MCP server。
- OpenAI/Anthropic 工具适配。

完整路线见 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)。

何切评分和解释生成方案见 [docs/strategy-and-explanation.md](./docs/strategy-and-explanation.md)。

## 环境要求

- Node.js 24 或更高版本。
- npm。

安装依赖：

```bash
npm install
```

## 使用方式

从命令行运行牌理分析：

```bash
npm run paili -- 3456m3455p123788s
```

输出格式为 JSON，后面附带计算耗时。

也可以传入模式参数：

```bash
npm run paili -- 3456m3455p123788s 0
npm run paili -- 3456m3455p123788s 1
```

模式含义：

- `0`：同时考虑一般形、七对子和国士无双。
- `1`：只考虑一般形向听。

运行通用手牌分析：

```bash
npm run analyze -- "123m456p789s1z"
npm run analyze -- "手牌: 3456m 3455p 123788s"
```

`analyze` 会根据手牌张数自动区分输出：

- `3n+1`：返回 `kind: "draw"`，包含进张列表 `draws` 和总进张数 `totalDraws`。
- `3n+2`：返回 `kind: "discard"`，包含候选切牌 `candidates` 和推荐切牌 `recommendation`。

运行何切服务层分析：

```bash
npm run nanikiru -- "3456m3455p123788s"
npm run nanikiru -- "手牌: 3456m 3455p 123788s"
```

`nanikiru` 只用于 `3n+2` 的“需要切一张牌”场景。若输入 `3n+1` 手牌，应使用 `npm run analyze` 查看进张和听牌状态。

何切结果会包含：

- `recommendation`：推荐切牌。
- `candidates`：候选切牌。服务层默认包含所有可切牌候选，候选自身带有 `shanten` 表示切出后的向听数。
- `score`：候选总评分。
- `scoreBreakdown`：向听、进张、好形、形状、打点潜力分项。
- `reasons`：结构化推荐理由。
- `explanation`：由高优先级 reasons 渲染出的中文解释。

## 代码调用示例

```ts
import { parseTileGroups } from "./src/core/tile.ts";
import { analyzeHand, analyzeTiles } from "./src/hand/paili.ts";
import { analyzeHandText } from "./src/service/analyze.ts";
import { analyzeNanikiru } from "./src/service/nanikiru.ts";

const byString = analyzeHand("3456m3455p123788s", 0);

const tiles = parseTileGroups("19m19p19s1234567z");
const byTiles = analyzeTiles(tiles, 0);

const drawAnalysis = analyzeHandText("123m456p789s1z");
const nanikiru = analyzeNanikiru("手牌: 3456m 3455p 123788s");

console.log(byString.shanten);
console.log(byTiles.draws);
console.log(drawAnalysis.kind);
console.log(nanikiru.recommendation);
```

也可以使用更底层的 counts API：

```ts
import { tilesToCounts34 } from "./src/core/counts.ts";
import { parseTileGroups } from "./src/core/tile.ts";
import { analyzeCounts } from "./src/hand/paili.ts";

const tiles = parseTileGroups("123m456p789s1z");
const counts = tilesToCounts34(tiles);
const result = analyzeCounts(counts, tiles, 0);
```

## 项目结构

```text
src/
  core/
    action.ts
    counts.ts
    rules.ts
    state.ts
    tile.ts
  hand/
    paili.ts
    paili-cli.ts
  strategy/
    evaluators/
      evaluate-shape.ts
      evaluate-value.ts
      evaluation.ts
    evaluate-nanikiru.ts
    nanikiru-policy.ts
    reason.ts
  explanation/
    render-nanikiru.ts
  service/
    analyze.ts
    analyze-cli.ts
    nanikiru.ts
    nanikiru-cli.ts
    parse-hand.ts
tests/
  analyze.test.ts
    evaluate-nanikiru.test.ts
    evaluate-shape.test.ts
    evaluate-value.test.ts
  nanikiru.test.ts
  paili.test.ts
docs/
  progress.md
  strategy-and-explanation.md
IMPLEMENTATION_PLAN.md
paili.py
```

`paili.py` 是原始 Python 参考实现，用于指导 TypeScript 重写和结果对照。

## 开发命令

运行类型检查：

```bash
npm run check
```

运行测试：

```bash
npm test
```

运行牌理 CLI：

```bash
npm run paili -- 3456m3455p123788s
```

底层 `paili` API 默认保持兼容，只返回最佳向听候选；如果需要包含向听后退候选，可以在代码中传入：

```ts
analyzeHand("3456m3455p123788s", 0, { includeShantenBack: true });
```

运行通用手牌分析 CLI：

```bash
npm run analyze -- "123m456p789s1z"
```

运行何切服务 CLI：

```bash
npm run nanikiru -- "手牌: 3456m 3455p 123788s"
```

## 进度记录

开发进度记录在 [docs/progress.md](./docs/progress.md)。每完成一个阶段后，都应该更新该文件。
