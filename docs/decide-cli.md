# decide CLI

`decide` 是基于 `GameState` 的动作推荐 CLI。当前版本只支持自家摸牌后切牌决策，内部调用 `chooseAction(state)`。

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

- `mode`：`attack` / `balance` / `defense` / `push`。
- `action`：当前推荐动作，目前只会是 `{ "type": "discard", "tile": "..." }`。
- `explanation`：中文解释。
- `recommendedCandidate`：推荐切牌的核心评分、分项和 reasons。

加 `--verbose` 会额外输出完整 `analysis`，包含所有候选。

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

防守评分当前覆盖：

- 现物、字牌见张、幺九牌、壁。
- 分级筋，安全度从高到低为 `1/9`、`2/8`、`4/5/6`、`3/7`。
- 无筋中张分级，危险度从高到低为 `5`、`4/6`、`3/7`、`2/8`。
- 宝牌和宝牌周边风险。
- 一发巡和亲家威胁风险。
- 晚巡风险。
- 切牌后的防守余力，以及较可靠防守牌不足时的惩罚。

解释中的“理由”只展示支持推荐动作的非负面理由；风险和代价类负面理由会单独出现在“注意”中。

## 轻量参数

位置参数：

- `hand`：自家手牌。可以直接给 14 张 `3n+2` 手牌；也可以给闭手部分并用 `--draw` 指定自摸牌。

自家参数：

- `--draw <tile>`：自摸牌，例如 `5p`。
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
- `lastDraw`：可选，自摸牌。
- `lastDiscard`：可选，最近弃牌事件。
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

轻量参数模式会自动构造 `visibleTiles`。完整 JSON 模式需要自行提供 `visibleTiles`，见 [示例](../examples/decide-state.example.json)。
