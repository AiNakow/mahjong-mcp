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
- 若提供局面信息，还应考虑对手威胁和安全度。

进入真实局面后，策略还会继续增加：

- 巡目。
- 宝牌。
- 对手立直和副露威胁。当前已有防守 MVP。
- 安全度。当前已有现物、分级筋、无筋中张分级、壁、字牌见张、宝牌风险、一发风险、亲家风险、防守余力和后续防守不足惩罚。
- 当前顺位和点差。当前已有南场领先/落后、终局附近、亲家相关和南四微差避四的第一版攻守阈值。
- 亲家/子家。当前已纳入自家亲家推进收益和亲家威胁风险。
- 南场收束策略。当前已有南场领先偏守、南场落后偏攻、终局附近领先强防守，以及南四三位微差时的抢和结束、保听流局、防放铳和四位追分目标。

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
  | "highPoints"
  | "defense"
  | "defenseComparison"
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
    defense: number;
  };
  reasons: Reason[];
};
```

纯手牌评分时 `defense` 为 0；当 `NanikiruContext` 提供对手威胁、弃牌河和可见牌信息时，防守 evaluator 会写入该分项。

## 第一版评分公式

初始何切评分建议使用简单可解释的线性模型：

```text
score =
  shantenScore
  + ukeireScore
  + goodShapeScore
  + shapeScore
  + valueScore
  + defenseScore
```

默认权重：

```ts
const DEFAULT_NANIKIRU_POLICY = {
  shantenWeight: 1000,
  ukeireWeight: 10,
  goodShapeWeight: 8,
  shapeWeight: 1,
  valueWeight: 1,
  defenseWeight: 1,
};
```

各项含义：

- `shantenScore`：向听数，避免选择向听后退的候选。
- `ukeireScore`：总进张数。
- `goodShapeScore`：好型相关进张数量。
- `shapeScore`：形状保留，例如两面、复合形、对子结构。
- `valueScore`：打点潜力，例如断幺、役牌、七对子、染手。
- `defenseScore`：安全度和危险度。无对手威胁信息时为 0。

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
  defenseWeight: number;

  yakuhaiPairBonus: number;
  tanyaoLeanBonus: number;
  chiitoiPairThreshold: number;
  chiitoiBonus: number;
  honitsuSuitThreshold: number;
  honitsuBonus: number;
  ittsuBonus: number;
  sanshokuBonus: number;
  chantaBonus: number;
  toitoiBonus: number;
  doraBonus: number;
  akaDoraBonus: number;
  doraSideBonus: number;
  useTwoLayerValueForIishanten: boolean;
  twoLayerValueDivisor: number;
  twoLayerMinAveragePoints: number;
  twoLayerMaxDrawTypes: number;
  twoLayerMaxTenpaiDiscards: number;
  assumeRiichiForMenzenTwoLayer: boolean;
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
  defenseWeight: 1,

  yakuhaiPairBonus: 80,
  tanyaoLeanBonus: 60,
  chiitoiPairThreshold: 4,
  chiitoiBonus: 50,
  honitsuSuitThreshold: 8,
  honitsuBonus: 80,
  ittsuBonus: 65,
  sanshokuBonus: 60,
  chantaBonus: 45,
  toitoiBonus: 55,
  doraBonus: 90,
  akaDoraBonus: 70,
  doraSideBonus: 18,
  useTwoLayerValueForIishanten: true,
  twoLayerValueDivisor: 160,
  twoLayerMinAveragePoints: 1500,
  twoLayerMaxDrawTypes: 5,
  twoLayerMaxTenpaiDiscards: 2,
  assumeRiichiForMenzenTwoLayer: true,
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

这样可以避免多条役种路线全部叠加导致虚高，同时又不会完全忽略兼容路线。

当前路线包括：

```text
yakuhai: 役牌路线
tanyao: 断幺路线
chiitoi: 七对子路线
honitsu: 染手路线
dora: 宝牌、赤宝牌和宝牌周边
ittsu: 一气通贯路线
sanshoku: 三色同顺路线
chanta: 全带路线
toitoi: 对对和路线
scoring: 听牌实算打点
two_layer_scoring: 一向听进张转听牌后的二层打点估算
```

当候选切出后已经听牌，且 `useScoringForTenpaiValue` 为 true 时，value evaluator 会枚举该候选的待牌，调用 `calculateAgariScore` 估算最高和牌点数，并按 `scoringValueDivisor` 折算为打点路线分。默认 `scoringValueDivisor` 为 `100`，例如最高和牌点数 5200 点会贡献约 52 分。何切上下文中的副露、场风、自风、规则、宝牌、本场和立直棒会透传给听牌实算。

未听牌阶段已经支持静态宝牌价值：

- `dora`：候选切牌后仍保留的宝牌按 `doraBonus` 加分。
- `aka_dora`：赤宝牌按 `akaDoraBonus` 加分；由于当前手牌内部已把 `0m/0p/0s` 规范化为 `5m/5p/5s`，若候选切出普通五，会保守视为可能切掉赤五并减少赤宝牌估值。
- 宝牌周边：候选切牌后仍保留的宝牌相邻数牌按 `doraSideBonus` 小幅加分，最多计 2 张，避免宝牌周边虚高。

一气通贯和三色同顺按顺子段完成度做静态启发式：完整顺子权重高于两张搭子，至少需要路线覆盖三段或三色且已有明确完成段才给分。全带按幺九相关面子、搭子和对子数量保守加分，并与断幺天然互斥。对对和按刻子和对子结构给分，通常会与七对子形成主次路线关系。

### 一向听二层打点估算

当候选切出后为一向听，且 `useTwoLayerValueForIishanten` 为 true 时，value evaluator 会做一层有限搜索：

```text
切 X 后 13 张一向听
  -> 枚举最多 twoLayerMaxDrawTypes 种有效进张 Y
  -> 对 afterDiscard + Y 做切牌分析
  -> 只看最多 twoLayerMaxTenpaiDiscards 个转听牌切牌 D
  -> 对 tenpaiHand + 最终待牌 Z 调用 calculateAgariScore
  -> 按 Z 的剩余枚数计算听牌平均点数
  -> 按 Y 的剩余枚数加权，得到候选 X 的平均预估打点
```

默认预算为：

```text
twoLayerMaxDrawTypes = 5
twoLayerMaxTenpaiDiscards = 2
```

这是为了把二层估算定位为策略信号，而不是完整 EV 搜索。门清手默认按“未来听牌可立直”估值，即 `assumeRiichiForMenzenTwoLayer = true`；副露手不会假设立直。

如果加权平均点数低于 `twoLayerMinAveragePoints`，该路线不计分。否则：

```text
twoLayerScore = round(averagePoints / twoLayerValueDivisor)
```

默认 `twoLayerValueDivisor = 160`。例如一向听进张转听牌后的平均打点约 5200 点，会贡献约 33 分。

该分数进入 `value` 分项，而不是覆盖 `ukeire`。因此高打点低进张与低打点高进张的平衡仍由总分决定：

```text
score =
  shanten
  + ukeire
  + goodShape
  + shape
  + value
  + defense
```

这种设计保留了速度和打点的张力：进张多的候选仍然通过 `ukeire` 占优，但满贯级转听牌潜力可以通过 `value` 抵消一部分速度劣势。

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

如果何切上下文提供 `bakaze` 或 `seatWind`，役牌路线会把对应风牌对子也纳入判断。副露手且 `rules.kuitan` 为 false 时，断幺路线不会作为有效起和路线加分。

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

- 更精细的条件计算，例如具体需要几番逆转、二位/三位目标和避四 EV。
- 纯全带幺九与混全带幺九的细分番型价值。

## 第一版局面策略和防守

当前已经新增初始 `GameState` 决策入口：

```ts
function chooseAction(state: GameState): ActionDecision
```

第一版只处理自家摸牌后需要切一张牌的场景。流程是：

```text
GameState
  -> 抽取自家手牌、宝牌、场风/自风、巡目、对手状态和 visibleTiles
  -> analyzeHandText 生成切牌候选
  -> chooseStrategyMode 判断 attack / balance / defense / push
  -> evaluateNanikiru 按模式权重评分
  -> 返回 discard 动作、模式、候选分析和解释
```

模式切换目前采用保守硬规则：

- 无立直威胁：`attack`。
- 有立直威胁且自己两向听以上：`defense`。
- 有立直威胁且自己听牌：`push`。
- 有立直威胁且自己一向听高打点：`push`。
- 有立直威胁且自己普通一向听：`balance`。

高打点手牌当前由两个信号判定：

- 自家手牌中宝牌数量达到 2 张以上。
- 或局面对象额外提供的 `averageWaitPoints` 达到 7700 点以上。

不同模式只调整权重，不改变底层牌理计算：

- `defense`：显著提高 `defenseWeight`，降低进张和好形权重。
- `balance`：提高防守权重，同时保留牌效判断；高打点时防守权重降为 2，普通局面为 5。
- `push`：保留一定防守惩罚，提高打点权重。
- `attack`：使用默认何切权重。

### 点棒/局况调整

当前局况模块位于：

```text
src/strategy/placement.ts
```

它从 `GameState` 计算：

- 自家当前排名。
- 与上一名、第一名、第四名的点差。
- 是否南场。
- 是否南四。
- 是否终局附近，当前定义为南场且 `kyoku >= 3`。
- 巡目。
- 自家是否亲家。
- 威胁者是否亲家。
- 三位领先四位的点差。
- 四位是否已经立直或两副露以上。

局况模块输出：

```ts
type PlacementAdjustment = {
  pushBias: number;
  defenseWeightMul: number;
  valueWeightMul: number;
  shantenWeightMul: number;
  ukeireWeightMul: number;
  avoidFourthGoal: "none" | "winOut" | "tenpaiKeep" | "fold" | "chase";
  reasons: Reason[];
};
```

当前规则：

```text
南场领先 12000 点以上：defenseWeightMul *= 1.4，pushBias -= 2
终局附近且自家第一：defenseWeightMul *= 1.8，pushBias -= 4
南场三位/四位且距一位 12000 点以上：valueWeightMul *= 1.25，pushBias += 2
自家亲家：valueWeightMul *= 1.1，pushBias += 1
威胁者亲家：defenseWeightMul *= 1.25，pushBias -= 1
有供托或本场达到 2 本场以上：valueWeightMul *= 1.05
供托 2 根以上或本场 3 本场以上：pushBias += 1
```

南四避四目标会读取当前向听数：

```text
自家四位：goal = chase，pushBias += 2，valueWeightMul *= 1.25，ukeireWeightMul *= 1.05
南四三位领先四位 4000 点以内且听牌：goal = winOut，偏向和牌结束
南四三位领先四位 4000 点以内且一向听：goal = tenpaiKeep，提高向听和进张权重
南四三位微差且早巡两向听以上：goal = none，避免起手直接弃和
南四三位微差且终盘手慢、四位立直或两副露以上：goal = fold，明显提高防守权重
南三或南场后半三位接近四位：一向听以内偏保听，手慢且四位进攻时偏防守
```

局况只做高层模式和权重修正，不直接改某张牌的底层牌理分：

```text
GameState
  -> chooseStrategyMode 得到基础模式
  -> evaluatePlacementAdjustment 得到局况调整
  -> adjustModeByPlacement 修正模式
  -> applyModePolicy
  -> applyPlacementPolicy
  -> evaluateNanikiru
```

当前模式修正规则较保守：

```text
goal = winOut：attack/balance -> push
goal = tenpaiKeep：不直接转 defense，主要通过 shantenWeight 和 ukeireWeight 表达
goal = fold：attack/balance -> defense，push -> balance
goal = chase：attack/balance -> push
balance + pushBias >= 2 -> push
balance + pushBias <= -2 -> defense
push + pushBias <= -3 -> balance
```

它不会把两向听以上的 `defense` 直接拉成 `push`。

局况模块会产出 `placement` reasons，例如：

```text
- 南场领先较多，当前优先降低放铳风险。
- 终局附近处于领先，防守权重明显提高。
- 南场落后较多，需要保留高打点推进路线。
- 自家亲家，推进连庄收益略高。
- 威胁者是亲家，放铳损失更高。
- 南四与四位微差，当前听牌，和牌结束是主要避四路线。
- 南四与四位微差，流局听牌也能避免罚符逆转，当前优先保听和速度。
- 南四手牌较慢且四位正在进攻，当前优先避免放铳落四。
- 当前四位，需要保留脱四所需打点推进。
```

### 防守 evaluator

当前防守模块位于：

```text
src/strategy/evaluators/evaluate-defense.ts
```

它只在存在威胁对手时生效。威胁对手当前定义为：

- 已立直。
- 或副露数达到 2 副露以上。

当前支持的安全/危险特征：

- 现物：最高安全度，尤其对立直者。
- 筋：按牌位分级降低数牌危险度，`1/9 > 2/8 > 4/5/6 > 3/7`。
- 壁：相邻牌四枚见时降低相关数牌危险度。
- 字牌见张：两枚见、三枚见以上逐步提高安全度。
- 幺九牌：基础危险度低于中张。
- 宝牌：显著提高危险度。
- 宝牌周边：小幅提高危险度。
- 晚巡：提高基础危险度。
- 无筋中张：按牌位提高危险度，`5 > 4/6 > 3/7 > 2/8`。
- 一发巡：威胁者处于一发状态时提高危险度。
- 亲家威胁：威胁者为东家时提高危险度。
- 防守余力：切牌后剩余手牌中的现物和分级筋会形成 `defenseReserveScore`。
- 后续防守不足惩罚：切牌后较可靠防守牌数量不足时扣分。

当前筋牌安全分：

```text
现物 = 100
1/9 筋 = 45
2/8 筋 = 35
4/5/6 筋 = 20
3/7 筋 = 10
```

“较可靠防守牌”当前按安全分 `>= 35` 统计，因此现物、`1/9` 筋和 `2/8` 筋计入，`4/5/6` 与 `3/7` 筋不计入。

当前无筋中张危险度补正：

```text
5 = +30
4/6 = +24
3/7 = +16
2/8 = +8
```

当前局面风险补正：

```text
一发巡 = +30
亲家威胁 = +25
```

后续防守不足惩罚：

```text
0 张较可靠防守牌：-220
1 张较可靠防守牌：-120
2 张较可靠防守牌：-50
3 张及以上：0
```

防守分的当前结构为：

```text
defenseScore =
  immediateSafetyMinusDanger
  + defenseReserveScore
  - futureDefensePenalty
```

防守模块产出 `defense` 和 `risk` reasons，例如：

```text
- 切 4z 是现物，安全度最高。
- 5m 是宝牌，对威胁者风险较高。
- 5m 是无筋中张，按牌位提高危险度。
- 对手处于一发巡，当前切牌风险上升。
- 威胁者是亲家，放铳损失更高。
- 7p 有筋可依，安全度按牌位修正。
- 切 4z 后仍保留 3 张较可靠防守牌。
- 切 5m 后后续防守资源偏少。
```

当前防守 evaluator 仍是 MVP，不包含：

- 早外侧。
- 里筋、跨筋、双无筋细分。
- 副露手染手危险色。
- 对手手出/摸切序列。
- 铳点期望。
- 精确铳点期望和逆转 EV。

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
2. 从推荐候选和必要的对比候选中挑选高优先级非负面 reasons。
3. 将 reasons 渲染为中文文本，并将负面 reasons 单独放到“注意”。

解释层不应该重新计算牌理、打点或防守，也不应该从最终推荐结果反推原因。

示例接口：

```ts
function renderNanikiruExplanation(result: EvaluatedNanikiruAnalysis): string {
  const best = result.candidates[0];
  const reasons = normalizeReasonPriorities(best.reasons)
    .filter((reason) => reason.polarity !== "negative")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);
  const warnings = best.reasons.filter((reason) => reason.polarity === "negative");

  return [
    `推荐：切 ${best.discard}。`,
    "理由：",
    ...reasons.map((reason) => reason.message),
    "注意：",
    ...warnings.map((reason) => reason.message),
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

注意：
- 虽然切 7s 牌效更高，但 7s 对立直者危险度较高。
```

这种差异不应由解释器硬编码，而应由防守模块在评分时产出对应 reasons。

## 与现有服务的关系

当前服务职责：

- `analyzeHandText`：通用手牌分析，区分 `3n+1` 和 `3n+2`。
- `analyzeNanikiru`：何切专用包装，只接受 `3n+2` 闭手牌，并可接收副露和局面上下文。
- `chooseAction`：`GameState` 决策入口，当前支持自摸后切牌，并按攻守模式调整何切评分权重。

当前已新增：

```text
src/strategy/
  reason.ts
  high-value.ts
  placement.ts
  nanikiru-context.ts
  nanikiru-policy.ts
  evaluate-nanikiru.ts
  choose-action.ts
  evaluators/
    evaluation.ts
    evaluate-defense.ts
    evaluate-shape.ts
    evaluate-value.ts

src/explanation/
  render-nanikiru.ts
```

当前职责：

- `analyzeHandText` 负责基础牌理分析。
- `evaluateNanikiru` 基于 `analyzeHandText` 的结果进行评分。
- `NanikiruContext` 承载副露、场风/自风、规则、宝牌、本场、巡目、对手状态和可见牌等上下文。
- 具体评分特征已拆入 `evaluators/`，避免 `evaluateNanikiru` 继续膨胀。
- `analyzeNanikiru` 返回评分后的候选、推荐牌、`scoreBreakdown`、`reasons` 和 `explanation`。
- `chooseAction` 将 `GameState` 转换成何切评分上下文，并输出推荐动作与局面模式。
- `renderNanikiruExplanation` 只渲染 reasons。

当前 shape evaluator 的基础识别范围包括：

- 两面搭子。
- 嵌张搭子。
- 边张搭子。
- 复合形，例如 `2334`、`3445`、`4556`、`5667`、`6778`、`1123`、`7889`。
- 孤立幺九字牌。

## 实现顺序建议

已完成的基础顺序：

1. 添加 `Reason`、`ScoreBreakdown`、`NanikiruPolicy` 和 `DEFAULT_NANIKIRU_POLICY`。
2. 实现纯手牌 `evaluateNanikiru`，评分逻辑写在 TypeScript 代码中。
3. 将权重、奖励分和阈值全部接入 `NanikiruPolicy`。
4. 将推荐逻辑从 `totalWaits` 排序改为 `score` 排序。
5. 为候选生成牌效、好型、形状、打点和防守 reasons。
6. 添加解释渲染函数。
7. 新增初始 `GameState -> chooseAction` 决策入口。
8. 补测试，覆盖结构化分数、配置生效、关键理由和防守现物优先。

后续建议顺序：

1. 扩展防守 evaluator：早外侧、里筋/跨筋/双无筋、副露染手危险色、手出/摸切信息。
2. 加入立直判断动作：听牌时评估立直、默听和切牌推进。
3. 加入副露动作判断：吃、碰、杠的合法性和收益/风险评分。
4. 扩展排名和点差策略：具体逆转条件、二位目标、避四 EV 和局收支阈值。
5. 等策略参数稳定后，再考虑添加 `config/policies/*.json` 加载能力。
