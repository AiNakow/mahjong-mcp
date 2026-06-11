# 策略层可维护性重构方案

当前何切策略已经从单纯牌效评分扩展到打点、路线、宝牌、同向听改良、防守、局况和候选间比较。继续在 `evaluate-value.ts`、`evaluate-route.ts`、`evaluate-nanikiru.ts` 中追加局部条件，会让规则互相缠绕。本文档定义后续策略层的目标结构和迁移步骤。

## 问题

当前主要问题：

- 同一个路线会在多个 evaluator 中重复识别，例如七对子、三色、全带和一气通贯。
- 打点、路线清晰度、改良和候选间 tie-break 的职责边界不清。
- policy 参数平铺，后续新增规则会让配置对象膨胀且难以归属。
- 回归案例通常通过局部补丁解决，容易影响不相关牌型。
- 解释层依赖 reasons，但 reasons 的来源仍分散在多个模块。

## 目标架构

目标调用链：

```text
analyze hand
  -> build candidate features
  -> evaluate route portfolio
  -> evaluate improvements
  -> build score vector
  -> apply game profile
  -> arbitrate final order
  -> render explanation
```

外部服务 API 保持不变，内部职责拆分为：

```text
CandidateFeatureExtractor
  生成每个候选的统一特征快照。

RouteModelRegistry
  独立识别每条役种/价值路线。

RoutePortfolio
  组合兼容路线，显式表达复合路线和冲突路线。

ImprovementEvaluator
  评估进向听、同向听和退向改良，不混入静态打点规则。

CandidateScorer
  将牌效、形状、路线、改良、防守和局况转成 ScoreBreakdown。

DecisionArbitrator
  只负责候选排序和最后 tie-break，不重新计算牌理。

ExplanationRenderer
  只消费结构化 reasons，不参与策略判断。
```

## CandidateFeature

每个候选先生成统一特征对象，后续模块只读 feature，不重复解析手牌。

```ts
interface CandidateFeature {
  discard: TileId;
  beforeDiscard: TileId[];
  afterDiscard: TileId[];

  shanten: number;
  waits: TileInfo[];
  totalWaits: number;
  goodShapeCount: number;
  goodShapeRatio: number;
  goodShapeDraws: TileId[];

  blocks: {
    pairCount: number;
    tripletCount: number;
    ryanmenCount: number;
    kanchanCount: number;
    penchanCount: number;
    complexShapeCount: number;
  };

  tiles: {
    terminalHonorCount: number;
    simpleCount: number;
    doraCount: number;
    akaDoraCount: number;
    doraSideCount: number;
    yakuhaiPairs: TileId[];
  };
}
```

原则：

- feature 可以扩展，但 evaluator 不应绕过 feature 重复扫描手牌。
- feature 只描述事实，不直接做最终策略判断。
- 可缓存的昂贵计算应在 feature 或 portfolio 层集中处理。

## RouteModel

每条路线实现统一接口：

```ts
interface RouteModel {
  id: RouteId;
  evaluate(feature: CandidateFeature, context: NanikiruContext, policy: NanikiruPolicy): RouteEvaluation;
}
```

输出：

```ts
interface RouteEvaluation {
  id: RouteId;
  strength: number;
  value: number;
  speedImpact: number;
  flexibility: number;
  requiredTiles: TileId[];
  conflictTags: RouteTag[];
  synergyTags: RouteTag[];
  reasons: Reason[];
}
```

例如：

- `ChiitoiRouteModel`：对子数、孤张质量、宝牌复合、顺子路线冲突。
- `ChantaRouteModel`：幺九相关 block、断幺互斥、全带稳定性。
- `SanshokuRouteModel`：三色段完成度、缺口、123/789 与全带复合。
- `DoraRouteModel`：实际宝牌、赤宝牌、宝牌周边和宝牌对子。
- `ChantaSanshokuCompositeModel`：只表达真实可复合路线，不再依赖 primary/secondary 折算偶然胜出。

## RoutePortfolio

候选不再只选择 `primary + secondary * ratio`，而是先生成路线组合：

```ts
interface RoutePortfolio {
  routes: RouteEvaluation[];
  lines: RouteLine[];
  bestLine?: RouteLine;
  conflicts: RouteConflict[];
}

interface RouteLine {
  ids: RouteId[];
  expectedHan: number;
  expectedPoints: number;
  speed: number;
  stability: number;
  requiredCommitment: number;
  score: number;
}
```

优先表达真实复合路线：

- 全带 + 三色。
- 混一色 + 役牌。
- 七对子 + 宝牌。
- 立直 + 平和/三色/一气通贯。

七对子不再因为对子数达到阈值就固定高分，而要根据预计点数、是否带宝牌、是否与顺子复合路线冲突来估值。

## ImprovementEvaluator

改良分为三类：

```text
advance improvement
  摸入后向听数下降。

same-shanten improvement
  摸入后向听数不变，但形状、宝牌、路线或转听牌价值提升。

shanten-back improvement
  退向后获得明显宝牌/好形/高打点改良。
```

同向听改良应独立建模，不再作为 value evaluator 的临时补丁。它只在早巡、无主动威胁、存在宝牌或明确复合路线线索时启用，并有搜索预算。

## ScoreVector 与仲裁

内部评分应先形成向量：

```ts
interface ScoreVector {
  shanten: number;
  speed: number;
  waitQuality: number;
  shape: number;
  route: number;
  value: number;
  improvement: number;
  defense: number;
  placement: number;
}
```

当前为了兼容外部输出，仍折叠成现有 `NanikiruScoreBreakdown`。`scoreBreakdown` 已扩展为包含 `improvement`，内部不再把同向听改良混入静态 `value` 来源。

`DecisionArbitrator` 负责最终排序：

1. 比较总分。
2. 若分差小于 epsilon，再比较向听。
3. 再比较进张和好型。
4. 再比较打点、改良、防守。
5. 最后才启用“先切中张”“外侧更安全”等 tie-break。

tie-break 不应覆盖明显的路线、打点或改良差距。

## Policy 分组

当前 `NanikiruPolicy` 先保持兼容，后续逐步迁移为：

```ts
interface StrategyPolicy {
  weights: WeightPolicy;
  speed: SpeedPolicy;
  routes: RoutePolicy;
  improvement: ImprovementPolicy;
  defense: DefensePolicy;
  arbitration: ArbitrationPolicy;
}
```

当前保留旧字段作为外部兼容接口，并通过 `normalizeStrategyPolicy()` 将旧 policy 规范化为分组 policy。这样不会破坏现有 `Partial<NanikiruPolicy>` 调用方。

## 测试策略

测试按策略职责拆分：

```text
feature-candidate.test.ts
route-portfolio.test.ts
improvement.test.ts
arbitration.test.ts
evaluate-nanikiru.test.ts
choose-action.test.ts
```

每个回归 case 至少断言：

- 推荐切牌。
- 主导 reason 或 route id。
- 不应出现的错误 tie-break reason。

## 迁移步骤

1. 已新增 `CandidateFeatureExtractor`，主评估链先构建统一 feature。
2. 已新增 `RouteModel` registry 和 `RoutePortfolio`，覆盖七对子、三色、全带、全带三色、宝牌和一气通贯等当前路线。
3. 已将 value evaluator 的静态路线判断替换为 portfolio 输出，旧 fallback 已移除。
4. 已将同向听改良迁移到 `ImprovementEvaluator`。
5. 已新增 `DecisionArbitrator`，把候选排序、退向压制和 tie-break 集中。
6. 已新增 policy 分组 helper，不改变外部 `Partial<NanikiruPolicy>` 调用方式。
7. 已扩展测试矩阵，锁定策略层边界。

## 当前实现状态

- 已新增 `CandidateFeature` 构建入口，主评估链通过统一 feature 向 shape、value、route 和 improvement 传递候选事实。
- 已新增 `RouteModel` 与 `ROUTE_MODELS` registry，覆盖宝牌、役牌、断幺、七对子、染手、一气通贯、三色、全带三色、全带和对对和。
- 已新增 `RoutePortfolio`，通过 registry 生成候选路线、兼容路线组合线和冲突信息。
- `evaluate-value` 只消费 portfolio 输出，旧的静态路线 fallback 已移除。
- `evaluate-route` 只消费 before/after portfolio，负责路线清晰度、路线破坏和少量路线层特殊抑制，不再重复识别具体役种路线。
- 同向听改良已迁移到 `ImprovementEvaluator`，并在 `scoreBreakdown.improvement` 中独立计分。
- 候选排序、退向压制和最终 tie-break 已集中到 `DecisionArbitrator`。
- 已新增 `normalizeStrategyPolicy`，在保持旧字段和 `Partial<NanikiruPolicy>` 兼容的同时暴露 `strategy.weights/routes/value/improvement/defense/arbitration` 分组。
- 已新增策略重构边界测试，覆盖 feature、portfolio、improvement 独立计分和 policy 分组兼容。

## 成功标准

- 新增一条路线时，不需要同时修改 value、route、shape 和 arbitration。
- 新增一个 tie-break 时，不需要改 value 或 route evaluator。
- 新增一个局况策略时，只调整 profile/policy，不直接改路线模型。
- 解释仍由 reasons 渲染，但 reasons 的来源和责任清晰。
- 当前 CLI、service 和测试的外部行为保持兼容。
