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
- 何切服务支持副露、场风/自风、宝牌和规则上下文输入；副露牌和宝牌指示牌会从剩余枚数中扣除。
- shape/value evaluator 已拆分；shape evaluator 支持基础两面、嵌张、边张、复合形和孤立幺九字牌识别。
- value evaluator 使用路线评分模型，按主路线全额计分、最佳次路线折扣计分；当前支持役牌、断幺、七对子、染手、一气通贯、三色同顺、全带、对对和以及听牌实算打点路线，并支持断幺与役牌路线冲突衰减。
- value evaluator 支持“拆役牌对子转断幺”的启发式，在中张延展明显更好的牌形中避免机械保留役牌对子。
- value evaluator 支持未听牌阶段的宝牌、赤宝牌和宝牌周边静态价值。
- value evaluator 支持一向听候选的二层打点估算：枚举有效进张后的转听牌候选，再按最终待牌剩余枚数调用计分模块估算平均打点。
- 速度与打点通过 `ukeire`、`goodShape` 和 `value` 分项共同进入总分，高打点低进张候选可以抵消一部分速度劣势，但不会直接覆盖牌效。
- 初始 `GameState` 决策入口，支持自摸后切牌推荐，并按 `attack`、`balance`、`defense`、`push` 模式调整策略权重。
- `decide` CLI 支持轻量参数构造局面，或通过 `--state` 读取完整 `GameState` JSON 文件。
- 防守 MVP 支持对立直/高副露威胁者评估现物、筋、壁、字牌见张、宝牌和宝牌周边风险。
- 基础何切解释层，将高优先级 reasons 渲染为中文解释。
- 和牌分解基础工具，支持一般形、七对子和国士无双，并保留多候选分解。
- 基础役种/符/点数计算入口，支持立直、两立直、门清自摸、断幺、役牌、平和、七对子、一杯口、二杯口、三色同顺、三色同刻、一气通贯、混全带幺九、纯全带幺九、三暗刻、三杠子、小三元、混老头、对对和、混一色、清一色、国士无双、四暗刻、大三元、小四喜、大四喜、字一色、清老头、绿一色、四杠子、九莲宝灯、天和、地和和宝牌计数。
- 双倍役满支持规则开关，默认不计双倍役满。
- 计分上下文会返回 `warnings`，并用 `invalid_context` 标记无法计分的矛盾输入。
- 支持普通宝牌、赤宝牌和里宝牌指示牌计翻；宝牌不作为起和役。赤宝牌用 `0m/0p/0s` 表示，并会规范化为对应的 `5m/5p/5s` 参与牌理。
- 计分服务层和 CLI，支持结构化传入和牌牌、荣和/自摸、自风、场风、立直、本场、立直棒和宝牌指示牌。
- 计分服务支持结构化副露输入；暗杠不破门清，吃/碰/明杠/加杠会按开门处理，食断由 `kuitan` 控制。
- 计分结果会用 `status` 区分未和牌、和牌但无役、正常计分；默认输出精简结果，使用 `verbose`/`--verbose` 时返回全部候选、分解和底层 raw。
- 简单的牌理 CLI。
- 使用 Node 内置测试框架覆盖当前行为。

## 尚未实现

- 完整 `GameState` 合法动作集合，目前只支持自摸后切牌决策。
- 完整局面策略评分，目前只有防守 MVP，尚未实现完整副露、立直和排名判断。
- 截图识别。
- 自然语言何切题解析。
- HTTP API。
- MCP server。
- OpenAI/Anthropic 工具适配。

完整路线见 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)。

何切评分和解释生成方案见 [docs/strategy-and-explanation.md](./docs/strategy-and-explanation.md)。

和牌分解与计分能力边界见 [docs/scoring.md](./docs/scoring.md)。

`GameState` 决策 CLI 见 [docs/decide-cli.md](./docs/decide-cli.md)。

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
npm run analyze -- "123m456p789s1z" 0 --verbose
```

`analyze` 会根据手牌张数自动区分输出：

- `3n+1`：返回 `kind: "draw"`，包含进张列表 `draws` 和总进张数 `totalDraws`。
- `3n+2`：返回 `kind: "discard"`，包含候选切牌 `candidates` 和推荐切牌 `recommendation`。

运行何切服务层分析：

```bash
npm run nanikiru -- "3456m3455p123788s"
npm run nanikiru -- "手牌: 3456m 3455p 123788s"
npm run nanikiru -- "手牌: 3456m 3455p 123788s" --mode 0 --verbose
npm run nanikiru -- "234m456p778s22z" --call pon:555z --seat 2z --round 1z --dora 1m --verbose
```

`nanikiru` 只用于 `3n+2` 的“需要切一张牌”场景。若输入 `3n+1` 手牌，应使用 `npm run analyze` 查看进张和听牌状态。传入副露时，手牌文本表示当前闭手部分，`--call` 表示已经固定的副露面子；例如一副露后的闭手何切通常是 11 张。

何切 CLI 可选上下文参数包括：

- `--mode 0` / `--mode 1`
- `--seat 1z`
- `--round 1z`
- `--honba 1`
- `--riichi-sticks 1`
- `--dora 123z`
- `--ura 123m`
- 赤宝牌请在手牌或副露中写作 `0m/0p/0s`。
- `--no-kuitan`
- `--double-yakuman`
- `--call pon:555z`
- `--call chi:789p:8p:left`
- `--call ankan:1111m`
- `--call minkan:9999p:9p:right`
- `--call kakan:2222s:2s:self`
- `--verbose`

何切结果会包含：

- `recommendation`：推荐切牌。
- `recommendedCandidate`：推荐候选的详细指标和理由。
- `calls` / `context`：本次何切使用的副露和局面上下文。
- `candidates`：全量候选切牌。默认不返回，使用 `verbose` 或 `--verbose` 时返回。候选自身带有 `shanten` 表示切出后的向听数。
- `score`：候选总评分。
- `scoreBreakdown`：向听、进张、好形、形状、打点潜力分项。
- `reasons`：结构化推荐理由。
- `explanation`：由高优先级 reasons 渲染出的中文解释。

运行计分服务层分析：

```bash
npm run score -- "123m456m789p234s22z" 4s ron --riichi --seat 3z --round 1z
npm run score -- "123m456p789s77s" 3m ron --call pon:555z
npm run score -- "123m456m789p234s22z" 4s ron --riichi --seat 3z --round 1z --verbose
```

前三个位置参数分别是手牌、和牌牌、和牌方式。和牌方式支持 `ron` 和 `tsumo`。可选参数包括：

- `--riichi`
- `--double-riichi`
- `--ippatsu`
- `--rinshan`
- `--chankan`
- `--haitei`
- `--houtei`
- `--tenhou`
- `--chiihou`
- `--double-yakuman`
- `--seat 1z`
- `--round 1z`
- `--honba 1`
- `--riichi-sticks 1`
- `--dora 123z`
- `--ura 123m`
- 赤宝牌请在手牌或副露中写作 `0m/0p/0s`。
- `--call pon:555z`
- `--call chi:789p:8p:left`
- `--call ankan:1111m`
- `--call minkan:9999p:9p:right`
- `--call kakan:2222s:2s:self`
- `--verbose`

计分结果中的 `status` 含义：

- `not_agari`：无法分解成和牌形。
- `invalid_context`：上下文存在不能计分的矛盾输入。
- `no_yaku`：可以分解成和牌形，但没有起和役。
- `scored`：存在有效计分候选，`best` 为最高点候选。

服务层默认不返回底层 `raw`。`scoreHand` 默认只返回 `best`，需要全部候选或分解时传入 `verbose`、`includeCandidates`、`includeDecompositions` 或 `includeRaw`。

运行局面决策：

```bash
npm run decide -- "345m35p13789s1234z" --turn 9 --left-riichi --left-discards 4z6m9p
npm run decide -- --state examples/decide-state.example.json
```

`decide` 当前只支持自摸后切牌决策。轻量参数和完整 JSON 字段说明见 [docs/decide-cli.md](./docs/decide-cli.md)。

## 代码调用示例

```ts
import { parseTileGroups } from "./src/core/tile.ts";
import { analyzeHand, analyzeTiles } from "./src/hand/paili.ts";
import { calculateAgariScore } from "./src/scoring/index.ts";
import { analyzeHandText } from "./src/service/analyze.ts";
import { analyzeNanikiru } from "./src/service/nanikiru.ts";
import { scoreHand } from "./src/service/score-hand.ts";
import { chooseAction } from "./src/strategy/choose-action.ts";

const byString = analyzeHand("3456m3455p123788s", 0);

const tiles = parseTileGroups("19m19p19s1234567z");
const byTiles = analyzeTiles(tiles, 0);

const drawAnalysis = analyzeHandText("123m456p789s1z");
const nanikiru = analyzeNanikiru("手牌: 3456m 3455p 123788s");
const scoreByService = scoreHand({
  text: "123m456m789p234s22z",
  winningTile: "4s",
  method: "ron",
  seatWind: "3z",
  bakaze: "1z",
  riichi: true,
});
const score = calculateAgariScore({
  hand: parseTileGroups("123m456m789p234s22z"),
  winningTile: "4s",
  method: "ron",
  seatWind: "3z",
  bakaze: "1z",
  riichi: true,
});
const decision = chooseAction({
  round: { bakaze: "1z", kyoku: 1, honba: 0, riichiSticks: 0, turn: 9 },
  self: {
    seatWind: "1z",
    points: 25000,
    hand: parseTileGroups("345m35p13789s1234z"),
    calls: [],
    discards: [],
    riichi: false,
    ippatsu: false,
    menzen: true,
  },
  opponents: [],
  doraIndicators: [],
  visibleTiles: Array(34).fill(0),
  rules: { akaDora: true, kuitan: true, doubleRon: true, countDoubleYakuman: false },
});

console.log(byString.shanten);
console.log(byTiles.draws);
console.log(drawAnalysis.kind);
console.log(nanikiru.recommendation);
console.log(scoreByService.best);
console.log(score.best);
console.log(decision.action);
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
      evaluate-defense.ts
      evaluate-shape.ts
      evaluate-value.ts
      evaluation.ts
    choose-action.ts
    evaluate-nanikiru.ts
    nanikiru-context.ts
    nanikiru-policy.ts
    reason.ts
  explanation/
    render-nanikiru.ts
  scoring/
    calculate.ts
    decompose.ts
    fu.ts
    index.ts
    points.ts
    types.ts
    yaku.ts
  service/
    analyze.ts
    analyze-cli.ts
    decide-cli.ts
    nanikiru.ts
    nanikiru-cli.ts
    parse-hand.ts
    score-hand.ts
    score-hand-cli.ts
tests/
  analyze.test.ts
    evaluate-nanikiru.test.ts
    evaluate-shape.test.ts
    evaluate-value.test.ts
  nanikiru.test.ts
  paili.test.ts
docs/
  decide-cli.md
  progress.md
  scoring.md
  strategy-and-explanation.md
examples/
  decide-state.example.json
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

运行计分服务 CLI：

```bash
npm run score -- "123m456m789p234s22z" 4s ron --riichi --seat 3z --round 1z
```

## 进度记录

开发进度记录在 [docs/progress.md](./docs/progress.md)。每完成一个阶段后，都应该更新该文件。
