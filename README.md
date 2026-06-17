# Mahjong AI

Mahjong AI 是一个 TypeScript 项目，目标是构建可复用的立直麻将分析引擎，并在后续通过 CLI、HTTP API、MCP 和工具 schema 暴露给现代 Agent 使用。

当前实现已覆盖牌理、计分、何切评分、EV 快速估算和基于 `GameState` 的统一动作推荐入口。它还不是完整的麻将对局 Agent：截图识别、HTTP API、MCP 和通用工具 schema 尚未实现。

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
- 策略层已拆分为候选特征、路线组合、改良、形状、打点、防守、局况和仲裁模块；主评估链先构建 `CandidateFeature`，再生成 `RoutePortfolio`。
- 路线模型通过 `ROUTE_MODELS` registry 集中注册；当前支持宝牌、役牌、断幺、七对子、染手、一气通贯、三色同顺、全带三色、全带和对对和。
- value evaluator 只消费 `RoutePortfolio` 与实算/二层打点结果，不再重复识别静态役种路线；route evaluator 只比较 before/after portfolio 的路线清晰度和破坏程度。
- Improvement evaluator 独立评估同向听改良，结果进入 `scoreBreakdown.improvement`，不再混入静态打点分。
- shape evaluator 支持基础两面、嵌张、边张、复合形和孤立幺九字牌识别。
- value evaluator 支持听牌实算打点、一向听二层打点估算，以及宝牌/赤宝牌/宝牌周边价值。
- 速度与打点通过 `ukeire`、`goodShape` 和 `value` 分项共同进入总分，高打点低进张候选可以抵消一部分速度劣势，但不会直接覆盖牌效。
- 早巡低价值窄听可以退向一向听做高质量改良：无主动威胁时，若当前听牌待牌少且无宝牌价值，候选能保留宝牌进张和好型改良，会按改良路线折算向听、进张和好型分。
- `GameState` 决策入口已接入统一动作仲裁器，支持自家摸牌后的自摸、立直、暗杠、加杠和切牌，也支持他家打牌后的荣和、吃、碰、大明杠和不鸣；完整 JSON 模式还可以表达抢杠响应和岭上摸牌阶段。
- 动作仲裁链路会先生成合法动作集合，再分别评估和牌、切牌、立直、副露、杠和不鸣候选；有效和牌会优先短路，避免继续运行昂贵的何切、EV 或副露分析。
- 普通切牌、立直切牌、副露后切牌和杠动作已接入快速 EV 估算；默认在原策略排序后做二次仲裁，可用 `--no-ev-decision` 关闭。
- 状态推进基础工具支持切牌、立直切牌、不鸣、吃/碰后的切牌、杠动作登记和和牌终局标记，并覆盖基础振听、临时振听、立直见逃振听、食替限制和立直后暗杠待牌不变约束。
- 点棒/局况策略层，支持南场领先偏守、终局附近领先强防守、南场落后偏推进、自家亲家推进收益、亲家威胁防守加权、供托/本场带来的小幅推进收益，以及南四微差避四的抢和、保听、弃和和四位追分目标。
- `decide` CLI 支持轻量参数构造局面，或通过 `--state` 读取完整 `GameState` JSON 文件。
- 防守 MVP 支持对立直/高副露威胁者评估现物、分级筋、无筋中张分级、壁、字牌见张、宝牌、宝牌周边风险、一发风险、亲家风险、防守余力和后续防守不足惩罚。
- 门清切后听牌会返回 `riichiJudgment` 和 `riichiPlanDecision`，先按场况、巡目、形状/打点改良和里宝期望判断是否立直，再分别给出默听候选和立直候选。
- 基础何切解释层，将高优先级正面 reasons 渲染为中文解释，并将负面 reasons 单独展示为“注意”。
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

- 完整对局循环和外部牌山推进；当前已有动作应用器和阶段推进工具，但还不是自动跑完整一局的引擎。
- 更完整的局面策略评分；当前已有防守 MVP、高打点推进、点棒/局况阈值、南四微差避四、基础副露/立直/杠仲裁和快速 EV，尚未实现手出/摸切读取、精确逆转 EV、包牌、四杠散了和多人同时荣和等复杂规则。
- 自然语言何切题解析。
- 截图识别。
- HTTP API。
- MCP server。
- OpenAI/Anthropic 工具适配。

历史总体路线图和长期方向见 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)。

当前权威文档：

- 命令行服务完整手册见 [docs/cli.md](./docs/cli.md)。
- 项目分层和模块设计见 [docs/architecture.md](./docs/architecture.md)。
- 策略仲裁、工作流程和策略细节见 [docs/strategy.md](./docs/strategy.md)。
- 和牌分解与计分能力边界见 [docs/scoring.md](./docs/scoring.md)。
- M7 Agent 兼容适配层实施方案见 [docs/agent-adapter-m7-plan.md](./docs/agent-adapter-m7-plan.md)。
- 开发进度记录见 [docs/progress.md](./docs/progress.md)。

历史阶段性设计稿保存在 [docs/archive/](./docs/archive/)。

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

`nanikiru` 只用于 `3n+2` 的“需要切一张牌”场景。若输入 `3n+1` 手牌，应使用 `npm run analyze` 查看进张和听牌状态。传入副露时，手牌文本表示当前闭手部分，`--call` 表示已经固定的副露面子；例如一副露后的闭手何切通常是 11 张。何切默认会在原策略排序后使用简化局面的 EV 二次仲裁；缺少对手河牌时放铳率估算置信度较低，可用 `--no-ev-decision` 关闭。

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
- `--no-ev-decision`

何切结果会包含：

- `recommendation`：推荐切牌。
- `recommendedCandidate`：推荐候选的详细指标和理由。
- `calls` / `context`：本次何切使用的副露和局面上下文。
- `candidates`：全量候选切牌。默认不返回，使用 `verbose` 或 `--verbose` 时返回。候选自身带有 `shanten` 表示切出后的向听数。
- `estimate`：候选的 EV 明细，包括和牌率、放铳率、期望点和局收支。默认推荐候选会带有该字段；使用 `--no-ev-decision` 时不生成。
- `score`：候选总评分。
- `scoreBreakdown`：向听、进张、好形、形状、路线、打点潜力、改良和防守分项。
- `reasons`：结构化推荐理由，包含正面、负面和中性理由。
- `explanation`：由高优先级正面 reasons 渲染出的中文解释；负面 reasons 会单独显示在“注意”。

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

`decide` 已接入统一动作入口。轻量参数可表达常见自摸后行动和他家打牌后的响应；抢杠、岭上摸牌和副露后切牌阶段请使用完整 JSON 局面模式。轻量参数和完整 JSON 字段说明见 [docs/cli.md](./docs/cli.md)。

当前防守评分覆盖：

- 现物、字牌见张、幺九牌、壁。
- 分级筋：`1/9` 筋、`2/8` 筋、`4/5/6` 筋、`3/7` 筋安全度依次降低。
- 无筋中张分级：`5`、`4/6`、`3/7`、`2/8` 危险度依次降低。
- 宝牌和宝牌周边风险。
- 一发巡和亲家威胁风险。
- 晚巡风险。
- 切牌后的防守余力，以及较可靠防守牌不足时的惩罚。

当前点棒/局况策略覆盖：

- 南场领先 12000 点以上提高防守权重。
- 终局附近且自家第一时进一步提高防守权重，并可把 `balance` 修正为 `defense`。
- 南场三位/四位且距一位 12000 点以上提高打点权重，并可把 `balance` 修正为 `push`。
- 自家亲家小幅提高推进收益。
- 威胁者亲家提高防守权重。
- 供托或本场增加时，小幅提高推进收益。
- 南四三位领先四位 4000 点以内时，根据向听和巡目切换 `winOut`、`tenpaiKeep`、`fold` 目标；听牌优先和牌结束，一向听和中巡手牌优先保听/速度，终盘手慢且四位进攻时转为防放铳。
- 自家四位时切换为 `chase` 目标，提高推进和打点权重以保留脱四路线。

当前推荐解释还包含少量候选间比较启发式：当一向听候选的进张和好型数接近时，若先切中张可以避免听牌后再切相对危险的中张，会在理由中说明；宝牌役牌对子场景会抑制弱断幺路线解释，避免把高价值役牌对子误说成断幺倾向。

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
    action-arbitration.ts
    action-types.ts
    agari-evaluation.ts
    evaluators/
      evaluate-defense.ts
      evaluate-route.ts
      evaluate-shape.ts
      evaluate-value.ts
      evaluation.ts
    apply-action.ts
    arbitration.ts
    call-constraints.ts
    call-evaluation.ts
    choose-action.ts
    ev-decision.ts
    evaluate-nanikiru.ts
    features.ts
    high-value.ts
    improvement.ts
    kan-evaluation.ts
    legal-actions.ts
    placement.ts
    riichi.ts
    nanikiru-context.ts
    nanikiru-policy.ts
    reason.ts
    routes.ts
  ev/
    deal-in-rate.ts
    estimate-round.ts
    hand-value.ts
    index.ts
    opponent-model.ts
    round-income.ts
    types.ts
    wall-model.ts
    win-rate.ts
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
    estimate.ts
    estimate-cli.ts
    nanikiru.ts
    nanikiru-cli.ts
    parse-hand.ts
    score-hand.ts
    score-hand-cli.ts
tests/
  analyze.test.ts
  choose-action.test.ts
  evaluate-nanikiru.test.ts
  evaluate-shape.test.ts
  evaluate-value.test.ts
  nanikiru.test.ts
  paili.test.ts
  strategy-refactor.test.ts
docs/
  agent-adapter-m7-plan.md
  architecture.md
  cli.md
  progress.md
  scoring.md
  strategy.md
  archive/
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
