# 从零实现立直麻将 Agent 能力计划

> 状态：历史总体路线图和长期方向。
>
> 本文记录项目从零实现时的总体目标、分层设想和长期里程碑。当前代码已经按实际演进完成了部分内容，也调整了部分模块边界，因此本文不再作为当前实现细节的权威说明。
>
> 当前实现状态以以下文档为准：
>
> - [docs/architecture.md](./docs/architecture.md)：项目分层、模块职责和当前能力边界。
> - [docs/cli.md](./docs/cli.md)：命令行服务完整使用说明。
> - [docs/strategy.md](./docs/strategy.md)：策略仲裁和工作流程。
> - [docs/scoring.md](./docs/scoring.md)：和牌分解与计分专题。
>
> 本文仍可用于参考长期方向，例如截图识别、HTTP API、MCP server、OpenAI/Anthropic tools schema 和更完整的 Agent 接入层。

目标：不对大模型做额外训练，不依赖第三方麻将计算库，从零实现立直麻将规则、牌理、策略、截图理解和 Agent 兼容接口，使任意现代 Agent 在看到标准立直麻将场面截图后，能够判断推荐动作、回答何切题，并给出可解释理由。

## 1. 总体架构

系统拆成多层：

```text
截图/文本题面
  -> 视觉识别层
  -> 标准局面状态 GameState
  -> 规则与牌理计算层
  -> 策略评分层
  -> 服务层
  -> Agent/应用适配层
```

核心原则：

- 大模型不直接判断规则合法性。
- 所有麻将计算都由确定性代码完成。
- 策略结果必须可解释、可测试、可复现。
- 面向任何 Agent 暴露标准接口，而不是绑定某个 LLM 框架。
- 核心麻将能力必须做成可复用库；MCP、HTTP API、CLI、OpenAI/Anthropic tools 都只是适配层。

推荐工程结构：

```text
src/
  core/
    tile.ts
    state.ts
    action.ts
    rules.ts
    wall.ts
  hand/
    normalize.ts
    shanten.ts
    block-dp.ts
    agari.ts
    waits.ts
    ukeire.ts
    shape.ts
  scoring/
    yaku.ts
    fu.ts
    points.ts
    dora.ts
  strategy/
    policy.ts
    evaluate-discard.ts
    evaluate-call.ts
    evaluate-riichi.ts
    defense.ts
    threat.ts
    placement.ts
    choose-action.ts
  vision/
    detect-table.ts
    detect-tiles.ts
    parse-screenshot.ts
    layouts/
  explanation/
    explain-decision.ts
    explain-nanikiru.ts
  service/
    parse-input.ts
    analyze.ts
    decide.ts
  schemas/
    game-state.schema.json
    action.schema.json
    decision.schema.json
    tool-schemas.ts
  tools/
    mcp-server.ts
    http-server.ts
    cli.ts
    openai-tools.ts
    anthropic-tools.ts
tests/
  fixtures/
  hand/
  scoring/
  strategy/
  vision/
docs/
  rules.md
  strategy.md
  state-schema.md
```

语言建议：TypeScript 或 Python 都可以。若目标是 Agent 工具、MCP、HTTP API 和 Web 服务，TypeScript 更方便；若目标是视觉处理和算法实验，Python 更方便。可以先用 TypeScript 做核心引擎和接口适配，后续再为视觉模块接 OpenCV/ONNX。

## 2. 标准数据模型

先定义稳定的牌和局面模型，这是后续所有模块的基础。

### 2.1 牌编码

推荐用紧凑字符串编码：

```text
1m-9m: 万子
1p-9p: 饼子
1s-9s: 索子
1z-7z: 东南西北白发中
0m,0p,0s: 赤五
```

内部计算时统一把赤五归一成 `5m/5p/5s`，额外记录 red flag。

```ts
type Suit = "m" | "p" | "s" | "z";

type Tile = {
  id: string;
  suit: Suit;
  rank: number;
  red: boolean;
};
```

为了高效计算，另外维护 34 种牌索引：

```text
0-8:   1m-9m
9-17:  1p-9p
18-26: 1s-9s
27-33: 1z-7z，东南西北白发中
```

手牌计算统一用：

```ts
type Counts34 = number[];
```

### 2.2 局面状态

```ts
type GameState = {
  round: {
    bakaze: "1z" | "2z" | "3z" | "4z";
    kyoku: number;
    honba: number;
    riichiSticks: number;
    turn: number;
  };
  self: PlayerState;
  opponents: PlayerState[];
  doraIndicators: Tile[];
  visibleTiles: Counts34;
  lastDraw?: Tile;
  lastDiscard?: DiscardEvent;
  rules: RuleConfig;
};

type PlayerState = {
  seatWind: "1z" | "2z" | "3z" | "4z";
  points: number;
  hand?: Tile[];
  calls: Call[];
  discards: Discard[];
  riichi: boolean;
  ippatsu: boolean;
  menzen: boolean;
};
```

截图识别得到的信息不一定完整，所以需要支持不确定性：

```ts
type RecognitionValue<T> = {
  value: T;
  confidence: number;
  alternatives?: T[];
};
```

## 3. 规则与牌理计算

这一层必须从零实现，不使用第三方麻将库。

### 3.1 向听数

至少实现三类向听：

- 一般形：四面子一雀头
- 七对子
- 国士无双

闭门普通分析时最终向听取三者最小值。副露手牌或只需要标准形分析时，使用标准形模式，只计算一般形向听；这一点参考 `paili.py` 的 `mode` 参数设计。

一般形必须使用分块 DP 算法实现，参考仓库中的 `paili.py`，不要在每次计算时直接对整手牌枚举雀头并递归拆解。

分块方式：

```text
万子块: counts[0:9]，允许顺子
饼子块: counts[9:18]，允许顺子
索子块: counts[18:27]，允许顺子
字牌块: counts[27:34]，不允许顺子
```

每个块先独立分析所有可能状态：

```ts
type BlockState = {
  melds: number;   // 面子数
  taatsu: number;  // 搭子数，包含两面、嵌张、对子搭子
  pairs: 0 | 1;    // 是否提供雀头候选
};
```

块内搜索规则：

1. 从当前块最小非零位置开始。
2. 尝试移除刻子。
3. 数牌块尝试移除顺子。
4. 数牌块尝试移除相邻搭子和嵌张搭子。
5. 所有块尝试移除对子搭子。
6. 所有块尝试把对子作为雀头候选。
7. 最后移除孤张。

块状态需要缓存：

```ts
analyzeBlock(blockCount, allowSequence) -> Set<BlockState>
```

缓存键为：

```text
`${allowSequence}:${blockCount.join("")}`
```

然后合并四个块的状态：

```text
states = {(melds: 0, taatsu: 0, pairs: 0)}
for each blockStates in [m, p, s, z]:
  next = combine(states, blockStates)
  states = prune(next)
```

合并时按目标面子数截断，避免无效状态膨胀：

```text
targetMelds = floor(tileCount / 3)
melds = min(a.melds + b.melds, targetMelds)
taatsu = min(a.taatsu + b.taatsu, targetMelds - melds)
pairs = min(1, a.pairs + b.pairs)
```

剪枝规则参考 `paili.py` 的 `prune_states`：同一 `(melds, pairs)` 下只保留 `taatsu` 最大的状态。

标准形向听计算：

```text
usefulTaatsu = min(taatsu, targetMelds - melds)
shanten = 2 * targetMelds - 2 * melds - usefulTaatsu - min(pairs, 1)
```

对 14 张手牌打牌后的 13 张、摸牌前 13 张、以及副露后目标面子数变化的情况，都使用 `targetMelds = floor(tileCount / 3)` 计算。

七对子：

```text
pairs = count(tileCount >= 2)
shanten = 6 - pairs
```

国士：

```text
terminalsHonors = 13 种幺九字牌
unique = count(present)
hasPair = any(count >= 2)
shanten = 13 - unique - (hasPair ? 1 : 0)
```

交付标准：

- 能正确计算常见 0-6 向听。
- 覆盖一般形、七对子、国士边界用例。
- 一般形向听实现必须与 `paili.py` 的分块 DP 思路一致。
- 对块状态和整手向听都做缓存，支持对每个可打牌候选重复计算。
- 何切分析中同一次请求共享 `shantenCache`，避免重复计算相同 `Counts34`。

### 3.2 听牌、进张和何切

听牌判断：

```text
shanten(hand) == 0
```

进张计算：

1. 对每种剩余牌 `t`，临时加入手牌。
2. 若新向听数小于当前向听数，则 `t` 是进张。
3. 剩余枚数 = 4 - 可见数量 - 手牌中数量。
4. 同一次分析复用 `shantenCache`，缓存键包含 34 维计数和模式。

何切核心：

```text
对每张可打牌：
  手牌移除该牌
  用分块 DP 计算向听
  用共享缓存计算进张集合和剩余枚数
  计算形状质量
  计算打点潜力
  计算危险度
  合成评分
```

输出必须包含：

- 推荐打牌
- 当前向听
- 打出后向听
- 进张种类和枚数
- 主要保留形
- 不推荐其他候选的原因

### 3.3 和牌判断

实现：

- 一般形和牌：四面子一雀头
- 七对子
- 国士无双

一般形可以基于递归拆牌：

```text
find pair
  remove pair
  recursively remove triplet or sequence
  success if all tiles removed
```

需要返回所有可能分解，因为役种和符计算依赖分解。

```ts
type AgariDecomposition = {
  type: "standard" | "chiitoi" | "kokushi";
  pair?: TileIndex;
  melds: MeldPattern[];
};
```

### 3.4 役种判断

第一阶段支持常见役：

- 立直
- 门前清自摸和
- 断幺九
- 平和
- 一杯口
- 役牌
- 场风、自风
- 七对子
- 对对和
- 三暗刻
- 三色同顺
- 一气通贯
- 混全带幺九
- 纯全带幺九
- 混一色
- 清一色
- 国士无双
- 四暗刻
- 大三元
- 小四喜/大四喜

第二阶段补齐：

- 海底、河底
- 岭上开花
- 抢杠
- 双立直
- 一发
- 三杠子
- 三色同刻
- 小三元
- 二杯口
- 流局满贯
- 天和、地和
- 绿一色、字一色、清老头、九莲宝灯

实现方式：

```ts
function detectYaku(context: WinContext, decompositions: AgariDecomposition[]): YakuResult[] {
  // 对每种分解分别判断，选择最高点数结果。
}
```

### 3.5 符和点数

点数模块分三步：

1. 根据役计算番数。
2. 根据和牌分解计算符。
3. 根据庄闲、自摸/荣和、场棒、立直棒计算支付。

必须实现限制：

```text
满贯: 5番，或 4番40符，或 3番70符
跳满: 6-7番
倍满: 8-10番
三倍满: 11-12番
役满: 13番以上或役满役
```

## 4. 策略系统

策略系统不要一开始追求精确 EV，而是先实现稳定的专家评分。

### 4.1 总决策流程

```ts
function chooseAction(state: GameState, policy: PolicyConfig): Decision {
  const legalActions = getLegalActions(state);
  const threat = estimateOpponentThreat(state);
  const mode = chooseMode(state, threat);

  const evaluated = legalActions.map(action =>
    evaluateAction(state, action, mode, policy)
  );

  return rankAndExplain(evaluated);
}
```

模式：

- `attack`: 正常进攻
- `push`: 高价值或听牌强攻
- `balance`: 半攻半守
- `defense`: 弃和防守

### 4.2 打牌评分

```text
score =
  shantenScore
  + ukeireScore
  + shapeScore
  + valueScore
  + riichiPotentialScore
  + placementScore
  - dangerPenalty
  - safetyLossPenalty
```

建议初始权重：

```ts
const defaultPolicy = {
  shantenWeight: 1000,
  ukeireWeight: 20,
  shapeWeight: 80,
  valueWeight: 120,
  riichiWeight: 150,
  dangerWeight: 900,
  safetyLossWeight: 120,
};
```

攻守模式影响权重：

```text
attack:  提高牌效、打点、立直权重
balance: 同时看牌效和危险度
defense: 大幅提高危险度和安全牌保留权重
```

### 4.3 形状评价

实现以下特征：

- 两面搭子：高分
- 嵌张、边张：低分
- 对子：根据役牌、雀头价值、七对子路线评分
- 复合形：额外加分
- 孤张：按价值排序

孤张价值：

```text
赤五/宝牌 > 役牌 > 中张 > 幺九 > 客风字牌
```

常见复合形：

```text
2334, 3445, 4556, 5667, 6778
1123, 7889
4456, 4566
```

### 4.4 打点潜力

打点估计先不需要精确到最终点数，先输出预计番数区间。

特征：

- 宝牌、赤宝牌
- 立直潜力
- 平和潜力
- 断幺潜力
- 役牌对子/刻子
- 七对子潜力
- 对对和潜力
- 染手潜力
- 三色、一通、全带潜力

示例：

```text
valueScore =
  dora * 160
  + redDora * 160
  + riichiPotential * 120
  + tanyaoPotential * 80
  + pinfuPotential * 80
  + honitsuPotential * 180
```

### 4.5 副露策略

吃碰杠判断：

```text
callScore =
  speedGain
  + tenpaiGain
  + yakuCertainty
  + valueGain
  - menzenLoss
  - defenseLoss
  - riskIncrease
```

硬规则：

- 副露后无役，除非有明确役牌/断幺/染手/役满路线，否则重罚。
- 门清一向听且形状好，通常不吃碰。
- 役牌对子碰出通常加分。
- 中后巡吃碰听牌加分。
- 对手立直后，非听牌副露通常禁止或强烈重罚。
- 大明杠默认谨慎，除非收益明确。

### 4.6 立直策略

立直评分：

```text
riichiScore =
  riichiHan
  + ippatsuUraPotential
  + waitQuality
  + dealerPressure
  + earlyTurnBonus
  - badWaitPenalty
  - defenseLockPenalty
  - placementPenalty
```

策略：

- 早巡好形低打点：倾向立直。
- 愚形低打点：看巡目、对手威胁和排名。
- 高打点默听：若已经满贯以上且荣和容易，可以考虑不立。
- 亲家听牌：立直倾向提高。
- 南场大幅领先：低价值愚形立直倾向降低。

### 4.7 防守策略

对每个对手估计威胁：

```text
threat =
  riichiThreat
  + openHandThreat
  + doraVisibility
  + turnPressure
  + dealerThreat
```

对每张牌估计危险度：

```text
danger =
  base
  - genbutsuSafety
  - sujiSafety
  - kabeSafety
  - honorSeenSafety
  + doraDanger
  + middleTileDanger
  + lateDiscardDanger
```

安全度优先级：

```text
现物 > 完全壁/四枚见 > 双筋 > 筋 > 两枚见字牌 > 幺九 > 中张无筋 > 宝牌/宝牌周边
```

攻守切换：

```text
若对手立直且自己两向听以上 -> 防守
若对手立直且自己一向听低打点 -> 偏防守
若自己听牌高打点 -> 可推进
若南场领先且有人威胁 -> 偏防守
若亲家且好形一向听/听牌 -> 推进权重提高
```

## 5. 截图识别方案

最终目标包含“看到场面截图后判断”。建议分三期。

### 5.1 第一期：固定布局模板识别

先支持一种或少数几种常见客户端截图，例如雀魂、天凤、Mortal 牌谱图。

流程：

```text
输入截图
  -> 检测画面尺寸和客户端布局
  -> 根据模板裁剪玩家手牌、河、副露、宝牌、点棒、风位
  -> 识别每张牌
  -> 组装 GameState
```

可以先手写模板坐标，不训练视觉模型。

牌识别实现：

- 准备 34 种牌面模板图片。
- 对裁剪出的牌图做缩放、灰度化、归一化。
- 使用模板匹配、边缘特征、颜色特征做分类。
- 对赤五单独识别红色区域。

输出每个牌的置信度，低置信度交给 Agent 询问或提示用户确认。

### 5.2 第二期：多布局适配

增加布局识别：

- 手牌区域检测
- 河区域检测
- 副露区域检测
- 宝牌区域检测
- 旋转方向处理

实现方式：

- 先用传统 CV：轮廓检测、矩形检测、颜色阈值。
- 再用轻量目标检测模型替代固定模板。

注意：用户要求不训练麻将 Agent，但视觉识别模型是否训练是另一个问题。如果严格不训练任何模型，则坚持模板匹配；如果允许训练视觉识别器，可以单独训练牌面检测模型。

### 5.3 第三期：截图到决策

```ts
function decideFromScreenshot(image: Buffer): ScreenshotDecision {
  const parsed = parseScreenshot(image);
  const state = buildGameState(parsed);
  const decision = chooseAction(state, defaultPolicy);
  return explainScreenshotDecision(parsed, state, decision);
}
```

解释必须包含：

- 识别出的手牌
- 当前局面摘要
- 推荐动作
- 牌效理由
- 打点理由
- 防守/风险理由
- 识别置信度问题

## 6. 何切题回答方案

何切题通常只有手牌、宝牌、巡目、场况，未必有完整四家信息。需要支持局面缺省。

输入格式：

```text
手牌: 234m 456p 22789s 1z1z, 摸 3s
宝牌: 7p
场况: 东1局 南家 6巡目 无立直
问题: 打什么？
```

解析成：

```ts
type NanikiruInput = {
  hand: Tile[];
  draw?: Tile;
  doraIndicators?: Tile[];
  round?: Partial<RoundState>;
  visibleTiles?: Counts34;
  constraints?: string[];
};
```

回答流程：

```text
解析题面
  -> 补默认场况
  -> 评估每个切牌候选
  -> 输出推荐
  -> 对比主要候选
```

回答格式：

```text
推荐：切 9s。

理由：
当前是一向听。切 9s 后保留 234m、456p、22s、78s 等有效形，进张为 6s/9s/2s 等，共 X 枚。
切 1z 会损失役牌对子价值；切 7s 会破坏 78s 搭子；切 2s 会削弱雀头候选。
在无明显防守压力的早中巡，应优先保持牌效。
```

## 7. Agent 兼容接口方案

为了让一般现代 Agent 都能获得这套麻将能力，核心实现不能绑定到某个 Agent SDK。推荐采用：

```text
核心麻将引擎
  -> 服务层
  -> MCP Server / HTTP API / CLI / OpenAI tools / Anthropic tools
```

核心原则：

- `core`、`hand`、`scoring`、`strategy`、`vision`、`explanation` 都是普通库代码，不依赖 MCP、OpenAI、LangChain 等框架。
- Agent 适配层只负责输入输出协议转换，不做麻将判断。
- 所有接口共享同一套 TypeScript 类型和 JSON Schema。
- MCP 是现代 Agent 的首选接口，HTTP API 是通用兼容层，CLI 是本地自动化兜底。

### 7.1 核心库 API

核心库暴露稳定函数，所有适配层都调用这些函数：

```text
parseMahjongText(input) -> NanikiruInput
parseMahjongScreenshot(image) -> ParsedTable
buildGameState(parsed) -> GameState
getLegalActions(state) -> Action[]
analyzeHand(state) -> HandAnalysis
evaluateDiscards(state) -> EvaluatedAction[]
evaluateCall(state, event) -> EvaluatedAction[]
evaluateRiichi(state) -> EvaluatedAction
chooseAction(state, policy) -> Decision
explainDecision(state, decision) -> string
```

### 7.2 服务层

服务层把不同输入统一成标准请求和响应：

```ts
type AnalyzeRequest = {
  state?: GameState;
  text?: string;
  image?: Buffer;
  policy?: Partial<PolicyConfig>;
};

type AnalyzeResponse = {
  state: GameState;
  analysis: HandAnalysis;
  decision?: Decision;
  explanation: string;
  warnings: string[];
};
```

服务层职责：

- 解析文本何切题。
- 解析截图并构造 `GameState`。
- 补齐缺省场况。
- 调用核心库分析和决策。
- 输出结构化结果和自然语言解释。
- 汇总低置信度识别、缺失场况、规则配置等警告。

### 7.3 MCP Server

MCP 是现代 Agent 的首选接入方式。MCP tools 建议包括：

```text
mahjong_parse_text(input) -> NanikiruInput
mahjong_parse_screenshot(image) -> ParsedTable
mahjong_analyze_hand(state | text) -> AnalyzeResponse
mahjong_evaluate_discards(state | text) -> EvaluatedAction[]
mahjong_choose_action(state | text | image, policy?) -> AnalyzeResponse
mahjong_explain_decision(state, decision) -> string
```

MCP 设计要求：

- 每个 tool 都提供清晰 JSON Schema。
- tool 返回结构化数据，不只返回一段自然语言。
- 对截图识别低置信度的情况，返回 `warnings` 和候选识别结果，允许 Agent 追问用户确认。
- MCP server 不直接依赖某个宿主 Agent，能够被 Claude Desktop、Codex、Cursor、Windsurf、Continue 或自定义 Agent 使用。

### 7.4 HTTP API

HTTP API 是通用兼容层，使任何能发请求的 Agent 或应用都能使用能力：

```text
POST /v1/mahjong/parse-text
POST /v1/mahjong/parse-screenshot
POST /v1/mahjong/analyze-hand
POST /v1/mahjong/evaluate-discards
POST /v1/mahjong/choose-action
POST /v1/mahjong/explain-decision
```

接口要求：

- 使用 JSON 请求和响应。
- 对图片支持 `multipart/form-data` 或 base64。
- 发布 `openapi.json`，方便其他 Agent 框架自动生成客户端。
- HTTP API 的请求/响应 schema 与 MCP tools 复用同一套定义。

### 7.5 CLI

CLI 是本地 Agent、测试和批处理的兜底接口：

```bash
mahjong-ai nanikiru "234m456p22789sEE draw=3s dora=7p"
mahjong-ai analyze-hand --state state.json
mahjong-ai choose-action --state state.json
mahjong-ai parse-screenshot ./table.png
```

CLI 要求：

- 默认输出人类可读解释。
- 支持 `--json` 输出结构化结果。
- 退出码区分成功、输入非法、识别低置信度、内部错误。
- CLI 应复用服务层，不直接绕过核心 API。

### 7.6 OpenAI / Anthropic tools schema

OpenAI function calling、Anthropic tools、LangChain Tool 等都作为薄适配：

```text
src/schemas/
  game-state.schema.json
  analyze-request.schema.json
  analyze-response.schema.json
  decision.schema.json
src/tools/
  openai-tools.ts
  anthropic-tools.ts
  langchain-tool.ts
```

要求：

- schema 从同一套类型生成，避免多处手写漂移。
- 这些适配层不包含麻将业务逻辑。
- 若某个 Agent 平台不支持 MCP，也可以通过 HTTP API 或 CLI 调用。

### 7.7 Agent 分工

代码工具负责：

- 规则
- 向听
- 进张
- 和牌
- 役种
- 点数
- 危险度
- 候选动作评分

LLM 负责：

- 调用工具
- 处理用户自然语言
- 在识别置信度低时追问
- 把工具结果组织成自然语言解释

## 8. 里程碑

### M1：牌和状态基础

交付：

- 牌编码和解析。
- 34 维计数转换。
- `GameState`、`Action` 类型。
- 基础输入校验。

验收：

- 能解析 `123m456p789s123z`。
- 能区分赤五和普通五。
- 能从题面构造最小局面。

### M2：向听和进张

交付：

- 基于分块 DP 的一般形向听。
- 七对子向听。
- 国士向听。
- 听牌和进张计算。
- 块状态缓存和整手向听缓存。

验收：

- 100+ 个固定测试用例。
- 与 `paili.py` 的核心样例输出保持一致。
- 何切候选能输出向听和进张。
- 同一何切请求内复用缓存，避免每个候选重复全量搜索。

### M3：和牌、役、点数

交付：

- 和牌分解。
- 常见役判断。
- 基础符番点数。
- 宝牌/赤宝牌。

验收：

- 常见牌型点数正确。
- 多分解牌型能选择最高点。

### M4：基础何切策略

交付：

- 打牌候选评分。
- 形状评价。
- 打点潜力。
- 基础解释生成。

验收：

- 能回答常见无防守何切题。
- 输出推荐和前三候选对比。

### M5：副露、立直、防守

交付：

- 吃碰杠合法动作。
- 副露策略。
- 立直策略。
- 现物、筋、壁、字牌安全度。
- 攻守切换。

验收：

- 对立直场面能优先打现物。
- 听牌高打点时能合理推进。
- 对无役副露给出负面评价。

### M6：截图识别 MVP

交付：

- 固定客户端布局模板。
- 手牌、宝牌、河、副露识别。
- 识别置信度。
- 截图转 `GameState`。

验收：

- 对同一客户端 50 张截图达到可用识别率。
- 低置信度能报告问题。

### M7：Agent 兼容适配层

交付：

- 稳定服务层 API。
- 共享 JSON Schema。
- CLI，支持普通输出和 `--json`。
- HTTP API 和 `openapi.json`。
- MCP server。
- OpenAI/Anthropic tools schema 适配。

验收：

- 支持 MCP 的现代 Agent 可通过 MCP tools 获取推荐。
- 不支持 MCP 的 Agent 可通过 HTTP API 或 CLI 获取推荐。
- 任意适配层调用同一套核心引擎，结果一致。
- 能通过截图或文本题面回答何切，并返回结构化结果和解释。

## 9. 测试策略

必须建立自己的测试集。

### 9.1 单元测试

覆盖：

- 牌解析
- 向听
- 进张
- 和牌分解
- 役种
- 符番点数
- 合法动作
- 危险度
- 策略评分

### 9.2 回归用例

建立 fixture：

```text
tests/fixtures/nanikiru/*.json
tests/fixtures/agari/*.json
tests/fixtures/scoring/*.json
tests/fixtures/defense/*.json
tests/fixtures/screenshots/*.json
```

何切测试不要求唯一答案完全固定，但要支持：

- 推荐牌在专家候选集合中。
- 解释包含关键牌效理由。
- 防守场面不推荐明显危险牌。

### 9.3 视觉测试

每张截图保存：

- 原图
- 期望手牌
- 期望宝牌
- 期望弃牌河
- 期望副露
- 识别置信度阈值

## 10. 风险和处理方式

主要风险：

- 向听算法边界复杂。
- 役种和符计算细节多。
- 截图识别受客户端皮肤、分辨率、缩放影响。
- 专家规则不可能达到训练模型水平。

处理方式：

- 先把规则计算做成强测试模块。
- 策略以可解释和可调为目标，不追求一开始最强。
- 视觉识别先固定布局，不急于泛化。
- 所有策略权重配置化，方便后续调参。

## 11. 最小可行版本定义

MVP 应能完成：

```text
输入：文本何切题
输出：推荐打牌 + 向听 + 进张 + 简短解释
```

第二个可用版本：

```text
输入：固定客户端截图
输出：识别出的手牌/场况 + 推荐动作 + 解释
```

最终版本：

```text
输入：标准现代立直麻将场面截图或文字局面
输出：合法动作判断、推荐动作、候选比较、牌效/打点/防守解释
接口：CLI + HTTP API + MCP + OpenAI/Anthropic tools
```

## 12. 推荐开发顺序

按下面顺序推进最稳：

1. 牌编码和状态模型。
2. 向听、听牌、进张。
3. 何切候选评分。
4. 和牌、役、点数。
5. 副露和立直合法性。
6. 防守和攻守切换。
7. 服务层和共享 JSON Schema。
8. CLI 和 HTTP API。
9. MCP server 和 OpenAI/Anthropic tools 适配。
10. 固定布局截图识别。
11. 截图到决策完整链路。
12. 多客户端布局和更强解释。

这个顺序能尽早得到可用能力：先回答何切题，再扩展到真实对局截图。
