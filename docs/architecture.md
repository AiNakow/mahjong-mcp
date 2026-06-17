# 项目架构与模块设计

Mahjong AI 是一个 TypeScript 立直麻将分析引擎。当前实现重点是确定性牌理、计分、策略评分、EV 快速估算和统一动作仲裁；截图识别、HTTP API、MCP 和通用工具 schema 尚未实现。

## 总体分层

```text
文本/JSON 输入
  -> service CLI/API facade
  -> core 数据模型与规则
  -> hand 牌理
  -> scoring 和牌计分
  -> strategy 策略评分与动作仲裁
  -> ev 快速局收支估算
  -> explanation 解释渲染
  -> JSON 输出
```

核心原则：

- `core`、`hand`、`scoring`、`strategy`、`ev` 是可复用库，不依赖 CLI。
- CLI 只负责参数解析、构造请求、调用服务层和输出 JSON。
- 策略解释来自评分模块产出的 reasons，不由解释器反向猜测。
- 合法动作生成只判断规则合法性，策略评分只消费合法动作。

## 目录职责

### core

路径：`src/core/`

职责：

- 牌编码和解析。
- 34 维计数辅助。
- 规则配置。
- `GameState`、`PlayerState`、`Call`、`Discard` 等局面模型。
- 基础动作类型。

关键文件：

- `tile.ts`：`TileId`、风牌、牌组解析、赤五解析。
- `counts.ts`：`Counts34` 与牌组转换。
- `rules.ts`：`RuleConfig`，包含赤宝牌、食断、双响、双倍役满等规则开关。
- `state.ts`：局面状态、玩家状态、副露、弃牌、杠事件。
- `action.ts`：基础动作模型。

`core` 不做策略判断。

### hand

路径：`src/hand/`

职责：

- 一般形分块 DP 向听。
- 七对子向听。
- 国士无双向听。
- 摸牌型进张分析。
- 切牌型候选分析。
- 好型进张统计。

关键入口：

- `analyzeHand(text, mode, options?)`
- `analyzeTiles(tiles, mode, options?)`
- `analyzeCounts(counts, tiles, mode, options?)`

向听模式：

- `0`：一般形、七对子、国士综合。
- `1`：一般形。

### scoring

路径：`src/scoring/`

职责：

- 和牌分解。
- 役种判断。
- 符计算。
- 点数计算。
- 上下文校验。

关键入口：

- `calculateAgariScore(context)`

服务层入口：

- `scoreHand(options)`

返回状态：

- `not_agari`
- `invalid_context`
- `no_yaku`
- `scored`

详细役种、符和点数范围见 [scoring.md](./scoring.md)。

### strategy

路径：`src/strategy/`

职责：

- 何切候选评分。
- 路线模型与打点潜力。
- 形状评价。
- 防守风险评价。
- 局况和点棒策略。
- 立直、副露、杠、和牌、不鸣评估。
- 合法动作生成。
- 统一动作仲裁。
- 动作应用和状态推进辅助。

主要模块：

- `choose-action.ts`：统一动作推荐入口。
- `legal-actions.ts`：合法动作集合生成。
- `action-types.ts`：`DecisionPhase`、`DecisionAction`、`EvaluatedAction`。
- `action-arbitration.ts`：不同动作类型的最终仲裁。
- `evaluate-action.ts`：切牌动作封装和通用动作评估辅助。
- `agari-evaluation.ts`：自摸/荣和评分和振听判断。
- `riichi.ts`：立直判断和立直计划。
- `call-evaluation.ts`：吃碰大明杠候选评分。
- `kan-evaluation.ts`：暗杠、加杠、大明杠评分。
- `apply-action.ts`：动作应用、临时振听、立直见逃振听和副露后状态推进。
- `evaluate-nanikiru.ts`：何切评分主入口。
- `features.ts`：候选事实快照。
- `routes.ts`：`ROUTE_MODELS` registry 与 `RoutePortfolio`。
- `improvement.ts`：同向听和退向改良。
- `arbitration.ts`：何切候选排序、退向压制和候选间比较理由。
- `placement.ts`：点棒、排名、南四避四和局况权重。
- `evaluators/`：shape、value、route、defense 等分项 evaluator。

详细策略流程见 [strategy.md](./strategy.md)。

### ev

路径：`src/ev/`

职责：

- 快速和牌率估算。
- 快速放铳率估算。
- 手牌价值估算。
- 局收支估算。
- 对手和牌/威胁模型。
- 牌山可见枚数模型。

关键入口：

- `estimateRound(...)`
- `estimateDiscardActions(...)`

当前 EV 是启发式快速估算，不是完整四人博弈搜索。策略层默认会在切牌、立直、副露后切牌和杠动作上挂接 EV，并只在原策略分数接近时让 EV 参与二次仲裁。

### service

路径：`src/service/`

职责：

- CLI 参数解析。
- 文本手牌解析。
- 服务级输入输出收敛。
- 调用底层库函数。

主要入口：

- `analyze.ts` / `analyze-cli.ts`
- `nanikiru.ts` / `nanikiru-cli.ts`
- `score-hand.ts` / `score-hand-cli.ts`
- `estimate.ts` / `estimate-cli.ts`
- `decide-cli.ts`
- `cli-common.ts`

当前服务层仍以 CLI 为主。HTTP API、MCP 和工具 schema 是后续接口层工作。

### explanation

路径：`src/explanation/`

职责：

- 将结构化 reasons 渲染成人类可读中文解释。

当前主要文件：

- `render-nanikiru.ts`

解释层不重新计算牌理、打点或风险。

### tests

路径：`tests/`

测试覆盖：

- 牌理。
- 通用分析。
- 何切策略。
- 计分。
- EV。
- 合法动作。
- 动作应用。
- 和牌/立直/副露/杠/不鸣仲裁。
- 策略重构边界。

测试脚本：

- `npm test`
- `npm run test:fast`
- `npm run test:slow`
- `npm run test:actions`

## 核心数据模型

### TileId

牌使用紧凑字符串：

```text
1m-9m, 1p-9p, 1s-9s, 1z-7z
```

赤五输入为 `0m/0p/0s`，进入核心牌理前规范化为 `5m/5p/5s`，赤宝牌数量作为额外上下文字段保留。

### Counts34

内部牌理使用 34 维计数：

```text
0-8:   1m-9m
9-17:  1p-9p
18-26: 1s-9s
27-33: 1z-7z
```

### GameState

`GameState` 是统一动作推荐入口的主要输入：

```ts
interface GameState {
  phase?: "self_draw" | "opponent_discard" | "chankan" | "rinshan_draw" | "after_call_discard";
  forbiddenDiscards?: TileId[];
  temporaryFuriten?: boolean;
  riichiFuriten?: boolean;
  round: RoundState;
  self: PlayerState;
  opponents: PlayerState[];
  doraIndicators: TileId[];
  visibleTiles: Counts34;
  lastDraw?: TileId;
  lastDiscard?: DiscardEvent;
  lastKan?: KanEvent;
  rules: RuleConfig;
}
```

`phase` 可显式指定当前决策阶段。没有显式阶段时，`chooseAction` 会根据 `lastDraw`、`lastDiscard` 和手牌形态做兼容判断。

### DecisionAction

策略层使用 `DecisionAction` 表达完整推荐动作。它比 `core/action.ts` 的公开动作更具体，例如吃碰候选会携带副露后切牌。

典型动作：

- `{ "type": "discard", "tile": "7s" }`
- `{ "type": "riichi", "tile": "7p" }`
- `{ "type": "tsumo" }`
- `{ "type": "ron" }`
- `{ "type": "pon", "calledTile": "5z", "tiles": ["5z", "5z", "5z"], "discard": "8m" }`
- `{ "type": "ankan", "tiles": ["5m", "5m", "5m", "5m"] }`
- `{ "type": "pass" }`

## 主要数据流

### 通用分析

```text
CLI text
  -> parse hand text
  -> analyzeHandText
  -> hand/paili
  -> JSON
```

### 何切

```text
text/options
  -> analyzeNanikiru
  -> analyzeHandText
  -> build CandidateFeature
  -> RoutePortfolio
  -> shape/value/route/improvement/defense evaluators
  -> DecisionArbitrator
  -> optional EV decision
  -> render explanation
```

### 计分

```text
text/options
  -> scoreHand
  -> parse hand/calls/red fives
  -> calculateAgariScore
  -> validation
  -> decompose
  -> yaku/fu/points
  -> best candidate
```

### 当前局面动作推荐

```text
GameState
  -> determineDecisionPhase
  -> generateLegalActions
  -> evaluateAgariActions
  -> optional agari short-circuit
  -> evaluate discard / riichi / call / kan / pass
  -> apply unified EV
  -> arbitrateActions
  -> ActionDecision
```

## 当前能力边界

已实现：

- 牌编码、赤五规范化和 34 维计数。
- 一般形、七对子、国士向听。
- 摸牌进张和切牌候选分析。
- 何切评分、路线、打点、改良、防守和解释。
- 和牌分解、常见役种、符番点数、本场和供托。
- 副露计分、宝牌、赤宝牌和里宝牌。
- `GameState` 统一动作推荐。
- 自摸、荣和、切牌、立直、吃、碰、杠、不鸣候选。
- 基础振听、临时振听、立直见逃振听、食替限制和立直后暗杠待牌不变约束。
- 快速 EV 估算和 EV 二次仲裁。
- CLI 服务。

尚未实现：

- 完整自动对局循环和外部牌山推进。
- 更复杂的特殊规则，例如包牌、四杠散了、多人同时荣和结算。
- 自然语言何切题解析。
- 截图识别。
- HTTP API。
- MCP server。
- OpenAI/Anthropic 工具 schema。

## 文档组织

当前权威文档：

- [cli.md](./cli.md)：命令行服务完整手册。
- [architecture.md](./architecture.md)：项目分层和模块设计。
- [strategy.md](./strategy.md)：策略仲裁和工作流程。
- [scoring.md](./scoring.md)：计分专题。
- [agent-adapter-m7-plan.md](./agent-adapter-m7-plan.md)：M7 Agent 兼容适配层实施方案。
- [progress.md](./progress.md)：开发进度流水。

历史阶段性设计稿保存在 [archive/](./archive/)。
