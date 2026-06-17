# decide CLI

`decide` 是基于 `GameState` 的动作推荐 CLI，内部调用 `chooseAction(state)`。当前版本已接入统一动作入口，支持自家摸牌后的自摸、立直、暗杠、加杠和切牌，也支持他家打牌后的荣和、吃、碰、大明杠和不鸣。完整 JSON 模式还可以表达抢杠响应和岭上摸牌阶段。

## 用法

轻量参数模式：

```bash
npm run decide -- "345m35p13789s1234z" --turn 9 --left-riichi --left-discards 4z6m9p
```

完整 JSON 局面模式：

```bash
npm run decide -- --state examples/decide-state.example.json
```

输出默认为 JSON，包含：

- `phase`：`self_draw` / `opponent_discard` / `chankan` / `rinshan_draw` / `after_call_discard` / `unknown`。
- `mode`：`attack` / `balance` / `defense` / `push`。
- `action`：当前推荐动作，例如 `{ "type": "discard", "tile": "7s" }`、`{ "type": "riichi", "tile": "7p" }`、`{ "type": "pon", "calledTile": "5z", "tiles": ["5z", "5z", "5z"], "discard": "8m" }`、`{ "type": "ankan", "tiles": ["5m", "5m", "5m", "5m"] }`、`{ "type": "ron" }` 或 `{ "type": "pass" }`。
- `explanation`：中文解释。
- `recommendedCandidate`：推荐切牌的核心评分、分项和 reasons。

默认会启用 EV 二次仲裁：原策略排序后，若前列候选分数接近，系统会用和牌率、放铳率、期望点和局收支估算重排同一决策带内的候选。切牌、立直切牌、副露后切牌和杠动作都会挂接统一的快速 EV；杠动作目前使用岭上补一摸和开新宝牌风险的近似估算，不是完整杠后搜索。加 `--no-ev-decision` 可关闭该步骤，只看原策略排序。

加 `--include-estimate` 会额外输出推荐候选的 EV 明细。加 `--verbose` 会额外输出完整 `analysis`，包含所有候选。

## 当前策略行为

`chooseAction` 会先根据局面选择模式：

- 无立直威胁：`attack`。
- 有立直威胁且自家两向听以上：`defense`。
- 有立直威胁且自家听牌：`push`。
- 有立直威胁且自家一向听高打点：`push`。
- 有立直威胁且自家普通一向听：`balance`。

高打点一向听当前按两个信号判断：手牌中宝牌达到 2 张以上，或完整 `GameState` 中额外提供的 `averageWaitPoints` 达到 7700 点以上。

基础模式会继续经过点棒/局况修正：

- 南场领先 12000 点以上：提高防守权重，降低推进倾向。
- 终局附近且自家第一：进一步提高防守权重，可能把 `balance` 修正为 `defense`。
- 南场三位/四位且距一位 12000 点以上：提高打点权重，可能把 `balance` 修正为 `push`。
- 自家亲家：小幅提高推进收益。
- 威胁者亲家：提高防守权重。
- 供托或本场增加：小幅提高推进收益。
- 南四三位领先四位 4000 点以内：根据向听数和巡目切换避四目标。听牌偏 `winOut` 抢和结束，一向听和中巡偏 `tenpaiKeep` 保听/速度，终盘手慢且四位进攻时偏 `fold` 防放铳。
- 自家四位：切换为 `chase` 目标，提高推进和打点权重以保留脱四路线。

和牌接受策略：

- 默认仍是有效自摸/荣和优先，不继续跑昂贵的何切、副露、杠和 EV 分析。
- 南四等终局场景下，如果自家落后且当前和牌收入仍不能提升名次，系统可以拒绝自摸或见逃荣和，推荐继续追逆转。
- 已立直时不会主动见逃，因为立直后见逃会进入立直振听。

杠相关阶段：

- `chankan`：抢杠响应窗口。当前只对他家加杠生成 `ron` / `pass`，荣和计分会带 `chankan` 役。
- `rinshan_draw`：自家杠后的岭上摸牌阶段。自摸计分会带 `rinshan` 役，同时仍会生成岭上后切牌、可行暗杠/加杠等动作。
- 暗杠/大明杠执行后需要外部牌山推进到 `rinshan_draw`。加杠会先进入 `chankan` 窗口，抢杠无人和后再推进岭上摸牌。

防守评分当前覆盖：

- 现物、字牌见张、幺九牌、壁。
- 分级筋，安全度从高到低为 `1/9`、`2/8`、`4/5/6`、`3/7`。
- 无筋中张分级，危险度从高到低为 `5`、`4/6`、`3/7`、`2/8`。
- 宝牌和宝牌周边风险。
- 一发巡和亲家威胁风险。
- 晚巡风险。
- 切牌后的防守余力，以及较可靠防守牌不足时的惩罚。

解释中的“理由”只展示支持推荐动作的非负面理由；风险和代价类负面理由会单独出现在“注意”中。

## 内部评分结构

`decide` 的切牌分析复用何切策略层。当前主链路为：

```text
analyze hand
  -> build CandidateFeature
  -> evaluate RoutePortfolio
  -> evaluate shape / route / value / improvement / defense
  -> apply placement policy
  -> arbitrate final order
  -> EV estimate and second-pass arbitration
  -> render explanation
```

候选的 `scoreBreakdown` 包含：

- `shanten`
- `ukeire`
- `goodShape`
- `shape`
- `route`
- `value`
- `improvement`
- `defense`
- `ev`

静态役种路线统一由 `ROUTE_MODELS` registry 识别，并通过 `RoutePortfolio` 提供给 value 和 route evaluator。候选排序、向听后退压制和候选间比较理由集中在 `DecisionArbitrator`。

EV 分数来自 `expectedRoundIncome / 100` 的低权重折算。它不会覆盖明确向听优势，只在同向听、原策略分数接近、且局收支差距足够明显时改变最终推荐。若 EV 改变排序，解释中会出现 `ev` 类型理由，说明相对候选的局收支差。

动作层 EV 也会写入 `EvaluatedAction.estimate`。切牌和副露后切牌使用实际切出牌估算放铳率；立直动作按 `riichi-discard` 估算立直棒收支；杠动作按 `minkan` / `ankan` / `kakan` 估算局收支并附带“近似”警告。

## 轻量参数

位置参数：

- `hand`：自家手牌。可以直接给 14 张 `3n+2` 手牌；也可以给闭手部分并用 `--draw` 指定自摸牌。

自家参数：

- `--draw <tile>`：自摸牌，例如 `5p`。
- `--last-discard <tile>`：最近他家打出的牌，例如 `5z`。
- `--last-discard-from <left|across|right>`：最近弃牌来源，默认 `right`。只有 `left` 来源可以吃。
- `--call <type:tiles[:calledTile[:from]]>`：自家副露，可重复。
- `--seat <wind>`：自风，默认 `1z`。
- `--points <number>`：自家点数，默认 `25000`。

场况参数：

- `--round <wind>`：场风，默认 `1z`。
- `--kyoku <number>`：局数，默认 `1`。
- `--turn <number>`：巡目，默认 `8`。
- `--honba <number>`：本场，默认 `0`。
- `--riichi-sticks <number>`：立直棒，默认 `0`。
- `--dora <tiles>`：宝牌指示牌，例如 `4m1z`。
- `--no-kuitan`：关闭食断。
- `--double-yakuman`：开启双倍役满。
- `--include-estimate`：输出推荐候选的和牌率、放铳率、期望点和局收支明细。
- `--no-ev-decision`：关闭 EV 二次仲裁。

轻量参数模式当前不提供 `--phase` 或 `--last-kan` 参数。需要测试抢杠、岭上或副露后切牌阶段时，请使用完整 JSON 局面模式。

对手方向参数：

- `left`：上家。
- `across`：对家。
- `right`：下家。

每个方向支持：

- `--left-riichi` / `--across-riichi` / `--right-riichi`
- `--left-discards <tiles>` / `--across-discards <tiles>` / `--right-discards <tiles>`
- `--left-call <type:tiles[:calledTile[:from]]>`，其他方向同理，可重复。
- `--left-points <number>`，其他方向同理。
- `--left-seat <wind>`，其他方向同理。

若不显式传对手自风，会按自家自风推导：

```text
right  = 下家 = 自风后一个风
across = 对家 = 自风后两个风
left   = 上家 = 自风后三个风
```

例如自家为东 `1z` 时：

```text
right  = 2z
across = 3z
left   = 4z
```

## 完整 JSON 字段

`--state` 文件应是 `GameState` 结构：

- `round.bakaze`：场风，`1z` 到 `4z`。
- `round.kyoku`：局数。
- `round.honba`：本场。
- `round.riichiSticks`：立直棒。
- `round.turn`：巡目。
- `self`：自家 `PlayerState`。
- `opponents`：三家 `PlayerState[]`。推荐顺序为 `[left, across, right]`。
- `doraIndicators`：宝牌指示牌数组。
- `visibleTiles`：34 维可见牌计数。
- `phase`：可选，显式指定决策阶段。支持 `self_draw`、`opponent_discard`、`chankan`、`rinshan_draw`、`after_call_discard`。
- `forbiddenDiscards`：可选，副露后食替限制下立即禁止切出的牌。
- `temporaryFuriten`：可选，普通临时振听状态。
- `riichiFuriten`：可选，立直后见逃导致的永久振听状态。
- `lastDraw`：可选，自摸牌。
- `lastDiscard`：可选，最近弃牌事件。
- `lastKan`：可选，最近杠事件。抢杠和岭上阶段需要提供。
- `rules`：规则配置。

`PlayerState` 字段：

- `seatWind`：自风。
- `points`：点数。
- `hand`：手牌数组。对手通常可省略。
- `calls`：副露数组。
- `discards`：弃牌数组，每项为 `{ "tile": "4z", "tsumogiri": false }`。
- `riichi`：是否立直。
- `ippatsu`：是否一发状态。
- `menzen`：是否门清。

`Call` 字段：

- `type`：`chi` / `pon` / `minkan` / `ankan` / `kakan`。
- `tiles`：副露牌。
- `calledTile`：可选，鸣到的牌。
- `from`：可选，`left` / `across` / `right` / `self`。

`lastKan` 字段：

- `type`：`minkan` / `ankan` / `kakan`。
- `tile`：杠牌。
- `playerIndex`：行动者座次索引。自家为 `0`，下家为 `1`，对家为 `2`，上家为 `3`。

抢杠 JSON 示例：

```json
{
  "phase": "chankan",
  "lastKan": { "type": "kakan", "tile": "4s", "playerIndex": 1 }
}
```

岭上 JSON 示例：

```json
{
  "phase": "rinshan_draw",
  "lastDraw": "4s",
  "lastKan": { "type": "ankan", "tile": "5z", "playerIndex": 0 }
}
```

轻量参数模式会自动构造 `visibleTiles`。完整 JSON 模式需要自行提供 `visibleTiles`，见 [示例](../examples/decide-state.example.json)。

## 测试拆分

- `npm run test:actions`：动作仲裁专项快测，覆盖合法动作、和牌阶段、动作应用和动作转换。
- `npm run test:fast`：日常轻量回归，不加载副露和二层估值慢测。
- `npm run test:slow`：副露、二层估值、立直计划和完整 choose-action 慢测。
