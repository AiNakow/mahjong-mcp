# 评分与解释方案

本文档记录当前已经实现的何切评分和解释生成基础层，以及后续扩展方向。

## 设计目标

何切推荐不能只按总进张数排序。即使是纯手牌何切，也至少需要同时考虑：

- 向听数是否后退。
- 总进张数。
- 好型率或好型进张数量。
- 形状保留。
- 打点潜力。
- 特殊路线，例如七对子、染手、断幺、役牌。

后续进入真实局面后，还会继续增加：

- 巡目。
- 宝牌。
- 对手立直和副露威胁。
- 安全度。
- 当前顺位和点差。
- 亲家/子家。
- 南场收束策略。

因此解释不能依赖一个越来越复杂的固定模板去反推“为什么这么打”。更合适的方式是：**每个评分模块在计算分数时同时产出理由，解释层只负责筛选和渲染这些理由。**

## 核心原则

决策流程应该是：

```text
候选动作
  -> 多个评分模块分别评估
  -> 每个模块输出 score + reasons
  -> 聚合总分
  -> 选择推荐动作
  -> 解释层渲染高优先级 reasons
```

不要采用：

```text
最终推荐动作
  -> 解释器反向猜测理由
```

这样可以避免后续策略复杂后解释器膨胀，也能保证解释与实际评分一致。

## Reason 数据结构

推荐定义统一的理由结构：

```ts
type ReasonType =
  | "shanten"
  | "ukeire"
  | "good_shape"
  | "shape"
  | "value"
  | "defense"
  | "riichi"
  | "placement"
  | "risk"
  | "rule";

type Reason = {
  type: ReasonType;
  polarity: "positive" | "negative" | "neutral";
  priority: number;
  message: string;
  data?: Record<string, unknown>;
};
```

字段含义：

- `type`：理由来源模块，例如进张、好型、打点、防守。
- `polarity`：该理由对候选是正面、负面还是中性。
- `priority`：解释展示优先级。高优先级理由更容易进入最终解释。
- `message`：可直接展示给用户的中文说明。
- `data`：结构化调试数据，供测试、Agent 或后续解释渲染使用。

## 候选评分结构

何切候选应该从当前的简单结构升级为：

```ts
type EvaluatedNanikiruCandidate = {
  discard: TileId;
  shanten: number;
  waits: TileInfo[];
  totalWaits: number;
  goodShapeCount: number;
  goodShapeDraws: TileId[];

  score: number;
  scoreBreakdown: {
    shanten: number;
    ukeire: number;
    goodShape: number;
    shape: number;
    value: number;
  };
  reasons: Reason[];
};
```

第一版可以只做纯手牌评分，不处理防守和场况。

## 第一版评分公式

初始何切评分建议使用简单可解释的线性模型：

```text
score =
  shantenScore
  + ukeireScore
  + goodShapeScore
  + shapeScore
  + valueScore
```

默认权重：

```ts
const DEFAULT_NANIKIRU_POLICY = {
  shantenWeight: 1000,
  ukeireWeight: 10,
  goodShapeWeight: 8,
  shapeWeight: 1,
  valueWeight: 1,
};
```

各项含义：

- `shantenScore`：向听数，避免选择向听后退的候选。
- `ukeireScore`：总进张数。
- `goodShapeScore`：好型相关进张数量。
- `shapeScore`：形状保留，例如两面、复合形、对子结构。
- `valueScore`：打点潜力，例如断幺、役牌、七对子、染手。

当前 `paili` 只返回最佳向听候选，所以 `shantenScore` 在第一阶段差异不大。但保留该字段有利于后续扩展到全候选评价。

## 策略配置与规则引擎边界

第一阶段不引入通用规则引擎。推荐采用：

```text
固定 TypeScript 评分模块
  + PolicyConfig 权重和阈值
  + 后续可选 JSON 策略配置文件
```

原因：

- 麻将策略依赖大量结构化计算，例如向听、进张、牌形、安全度，不适合全部写成通用 if/then 规则。
- 当前策略规则数量还少，过早引入规则引擎会增加调试成本。
- TypeScript 模块更容易测试，也更容易复用现有牌理计算结果。
- 大多数可调内容其实是权重和阈值，不需要完整规则 DSL。

因此第一版策略逻辑写在代码模块中，但关键参数放在配置对象中。

建议定义：

```ts
type NanikiruPolicy = {
  shantenWeight: number;
  ukeireWeight: number;
  goodShapeWeight: number;
  shapeWeight: number;
  valueWeight: number;

  yakuhaiPairBonus: number;
  tanyaoLeanBonus: number;
  chiitoiPairThreshold: number;
  chiitoiBonus: number;
  honitsuSuitThreshold: number;
  honitsuBonus: number;
  secondaryValueRouteRatio: number;
  yakuhaiTanyaoConflictDecay: number;
  breakYakuhaiPairForTanyaoBonus: number;
  useScoringForTenpaiValue: boolean;
  scoringValueDivisor: number;
};
```

默认配置：

```ts
const DEFAULT_NANIKIRU_POLICY: NanikiruPolicy = {
  shantenWeight: 1000,
  ukeireWeight: 10,
  goodShapeWeight: 8,
  shapeWeight: 1,
  valueWeight: 1,

  yakuhaiPairBonus: 80,
  tanyaoLeanBonus: 60,
  chiitoiPairThreshold: 4,
  chiitoiBonus: 50,
  honitsuSuitThreshold: 8,
  honitsuBonus: 80,
  secondaryValueRouteRatio: 0.35,
  yakuhaiTanyaoConflictDecay: 0.6,
  breakYakuhaiPairForTanyaoBonus: 50,
  useScoringForTenpaiValue: true,
  scoringValueDivisor: 100,
};
```

评分模块读取配置：

```ts
score += candidate.totalWaits * policy.ukeireWeight;
score += candidate.goodShapeCount * policy.goodShapeWeight;

if (hasYakuhaiPair(afterDiscardTiles)) {
  score += policy.yakuhaiPairBonus;
}
```

### 哪些内容写代码

以下内容应该由 TypeScript 代码实现：

- 向听数计算。
- 进张枚数计算。
- 好型进张统计。
- 牌形识别。
- 打点潜力特征提取。
- 防守安全度计算。
- 后续的役种、符、点数计算。

这些逻辑依赖结构化数据和算法，写成代码更清晰。

### 哪些内容放配置

以下内容应该放在 `PolicyConfig` 或后续 JSON 配置中：

- 各评分项权重。
- 奖励/惩罚分值。
- 阈值，例如对子数量达到多少时认为有七对子路线。
- 不同策略风格，例如进攻型、平衡型、防守型。

示例配置文件可以是：

```text
config/policies/default.json
config/policies/aggressive.json
config/policies/defensive.json
```

示例内容：

```json
{
  "ukeireWeight": 10,
  "goodShapeWeight": 8,
  "yakuhaiPairBonus": 80,
  "tanyaoLeanBonus": 60,
  "chiitoiPairThreshold": 4,
  "chiitoiBonus": 50
}
```

### 何时考虑有限规则表

未来可以考虑用有限规则表处理高层模式切换，例如：

```json
{
  "modeRules": [
    {
      "when": {
        "opponentRiichi": true,
        "selfShantenAtLeast": 2
      },
      "mode": "defense"
    },
    {
      "when": {
        "selfTenpai": true,
        "estimatedValueAtLeast": 3900
      },
      "mode": "push"
    }
  ]
}
```

这类规则表只用于攻守模式、推进/防守倾向等高层决策，不用于底层牌理和计分。底层计算仍由代码模块负责。

### 暂不做通用规则引擎

当前不建议实现通用规则引擎。除非后续出现大量需要非开发者编辑的策略规则，否则会优先保持：

```text
代码实现算法
配置调整权重
有限规则表处理模式切换
```

这比完整规则引擎更容易调试、测试和维护。

## 第一版打点潜力

第一版不做完整役种判断，只做静态启发式。建议先支持：

### 役牌对子

如果切牌后仍保留 `5z/6z/7z` 的对子，给加分。

如果未来 `GameState` 中有场风和自风，也应将对应风牌对子纳入役牌对子判断。

理由示例：

```text
保留役牌对子，有直接成役价值。
```

### 断幺倾向

如果切牌后手牌主要由中张组成，且幺九字牌较少，给加分。

理由示例：

```text
手牌偏断幺，后续打点和副露灵活性较好。
```

### 七对子路线

如果切牌后对子数量较多，例如 4 对以上，给加分。

理由示例：

```text
对子较多，保留七对子路线。
```

### 染手倾向

如果某一门数量明显多，并且其他数牌较少，给加分。

理由示例：

```text
同一花色较集中，有染手潜力。
```

### 路线评分模型

打点潜力不要把所有路线简单累加。当前设计采用：

```text
valueScore = primaryRoute.score + secondaryRoute.score * secondaryValueRouteRatio
```

含义：

- `primaryRoute`：当前候选最主要的打点路线，全额计入。
- `secondaryRoute`：分数第二高的兼容路线，按比例折算。
- `secondaryValueRouteRatio`：默认 `0.35`，表示次要路线只按 35% 计入。

这样可以避免“役牌 + 断幺 + 七对子 + 染手”全部叠加导致虚高，同时又不会完全忽略兼容路线。

当前路线包括：

```text
yakuhai: 役牌路线
tanyao: 断幺路线
chiitoi: 七对子路线
honitsu: 染手路线
scoring: 听牌实算打点
```

当候选切出后已经听牌，且 `useScoringForTenpaiValue` 为 true 时，value evaluator 会枚举该候选的待牌，调用 `calculateAgariScore` 估算最高和牌点数，并按 `scoringValueDivisor` 折算为打点路线分。默认 `scoringValueDivisor` 为 `100`，例如最高和牌点数 5200 点会贡献约 52 分。

### 役牌与断幺冲突

役牌对子不应该永远无条件高加分。若手牌其他部分明显偏断幺，拆掉役牌对子可能反而保留更好的延展性、好型率和副露性。

因此役牌路线会根据断幺强度衰减：

```text
yakuhaiScore = yakuhaiPairBonus * (1 - tanyaoStrength * yakuhaiTanyaoConflictDecay)
```

当前 `tanyaoStrength` 的粗略定义：

- `1.0`：没有幺九字牌。
- `0.7`：只有 1-2 张孤立幺九字牌。
- `0.35`：有少量幺九/字牌对子。
- `0`：幺九字牌较多，断幺路线弱。

`yakuhaiTanyaoConflictDecay` 默认 `0.6`。断幺强度越高，役牌路线加分越低。

### 拆役牌对子转断幺

有些手牌虽然含有役牌对子，但其他部分已经非常接近断幺形。此时保留役牌对子并不一定更好，因为它可能牺牲：

- 断幺路线的成役稳定性。
- 中张延展性。
- 副露后的灵活性。
- 好型改良空间。

当前实现会识别这类候选：如果切出的是 `5z/6z/7z`，切后该役牌只剩一张，并且切后的手牌断幺强度足够高，则给断幺路线额外加分：

```text
tanyaoRouteScore += breakYakuhaiPairForTanyaoBonus
```

默认 `breakYakuhaiPairForTanyaoBonus` 为 `50`。对应理由示例：

```text
拆役牌对子后，手牌更接近断幺路线，延展性和副露空间更好。
```

例如 `34678m34p77755s66z` 这类牌，拆 `66z` 后保留的主要是中张和顺子延展，当前评分会优先认可断幺路线，而不是机械保留役牌对子。

### 暂不实现的打点项

以下项目等完整局面和规则模块更成熟后再实现：

- 根据完整 `GameState` 自动注入场风、自风、立直、宝牌和副露上下文。
- 对一向听候选做二层进张后的期望打点枚举。
- 将防守、点棒状况和排名需求纳入打点权重。
- 混全带幺九/纯全带幺九。

## 第一版 reasons 示例

对候选 `切 7s`，评分模块可以产出：

```ts
[
  {
    type: "ukeire",
    polarity: "positive",
    priority: 90,
    message: "切 7s 后总进张 50 枚，是候选中最多。",
    data: { totalWaits: 50 }
  },
  {
    type: "good_shape",
    polarity: "positive",
    priority: 75,
    message: "其中好型相关进张 25 枚。",
    data: { goodShapeCount: 25 }
  }
]
```

如果候选牺牲打点，也可以产出负面理由：

```ts
{
  type: "value",
  polarity: "negative",
  priority: 60,
  message: "切 5z 会拆掉役牌对子，降低成役稳定性。",
  data: { tile: "5z" }
}
```

## 解释层职责

解释层只做三件事：

1. 选择推荐候选。
2. 从推荐候选和必要的对比候选中挑选高优先级 reasons。
3. 将 reasons 渲染为中文文本。

解释层不应该重新计算牌理、打点或防守，也不应该从最终推荐结果反推原因。

示例接口：

```ts
function renderNanikiruExplanation(result: EvaluatedNanikiruAnalysis): string {
  const best = result.candidates[0];
  const reasons = best.reasons
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  return [
    `推荐：切 ${best.discard}。`,
    ...reasons.map((reason) => reason.message),
  ].join("\n");
}
```

## 输出示例

```text
推荐：切 7s。

理由：
- 切 7s 后总进张 50 枚，是候选中最多。
- 其中好型相关进张 25 枚。
- 相比切 5p 的 45 枚，切 7s 的牌效更高。
```

注意：这只是纯手牌牌效解释。后续加入局面策略后，解释可能变成：

```text
推荐：切 1z。

理由：
- 当前对手立直，1z 是现物，安全度最高。
- 自己仍是两向听，进攻收益不足以支撑推进。
- 虽然切 7s 牌效更高，但 7s 对立直者危险度较高。
```

这种差异不应由解释器硬编码，而应由防守模块在评分时产出对应 reasons。

## 与现有服务的关系

当前服务职责：

- `analyzeHandText`：通用手牌分析，区分 `3n+1` 和 `3n+2`。
- `analyzeNanikiru`：何切专用包装，只接受 `3n+2`。

当前已新增：

```text
src/strategy/
  reason.ts
  nanikiru-policy.ts
  evaluate-nanikiru.ts
  evaluators/
    evaluation.ts
    evaluate-shape.ts
    evaluate-value.ts

src/explanation/
  render-nanikiru.ts
```

当前职责：

- `analyzeHandText` 负责基础牌理分析。
- `evaluateNanikiru` 基于 `analyzeHandText` 的结果进行评分。
- 具体评分特征已拆入 `evaluators/`，避免 `evaluateNanikiru` 继续膨胀。
- `analyzeNanikiru` 返回评分后的候选、推荐牌、`scoreBreakdown`、`reasons` 和 `explanation`。
- `renderNanikiruExplanation` 只渲染 reasons。

当前 shape evaluator 的基础识别范围包括：

- 两面搭子。
- 嵌张搭子。
- 边张搭子。
- 复合形，例如 `2334`、`3445`、`4556`、`5667`、`6778`、`1123`、`7889`。
- 孤立幺九字牌。

## 实现顺序建议

1. 添加 `Reason`、`ScoreBreakdown`、`NanikiruPolicy` 和 `DEFAULT_NANIKIRU_POLICY`。
2. 实现纯手牌 `evaluateNanikiru`，评分逻辑写在 TypeScript 代码中。
3. 将权重、奖励分和阈值全部接入 `NanikiruPolicy`，不要散落硬编码常量。
4. 将推荐逻辑从 `totalWaits` 排序改为 `score` 排序。
5. 为候选生成牌效、好型和打点潜力 reasons。
6. 添加解释渲染函数。
7. 更新 CLI，让 JSON 中包含 `score`、`scoreBreakdown`、`reasons` 和 `explanation`。
8. 补测试，测试重点放在结构化分数、配置生效和关键理由，不要过度绑定完整自然语言文本。
9. 等策略参数稳定后，再考虑添加 `config/policies/*.json` 加载能力。
