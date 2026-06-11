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
