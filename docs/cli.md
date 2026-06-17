# 命令行服务手册

本文是当前 CLI 的权威说明，覆盖 `package.json` 中已实现的命令：

- `npm run paili`
- `npm run analyze`
- `npm run nanikiru`
- `npm run score`
- `npm run estimate`
- `npm run decide`

所有命令默认输出 JSON。异常输入会向 stderr 输出错误信息，并设置非零退出码。牌编码统一使用：

- `1m-9m`：万子。
- `1p-9p`：饼子。
- `1s-9s`：索子。
- `1z-7z`：东、南、西、北、白、发、中。
- `0m/0p/0s`：赤五。赤五在牌理中按对应 `5m/5p/5s` 计算，并在服务层统计赤宝牌数量。

副露参数统一使用：

```text
type:tiles[:calledTile[:from]]
```

其中 `type` 为 `chi`、`pon`、`minkan`、`ankan`、`kakan`，`from` 为 `left`、`across`、`right`、`self`。

## paili

底层牌理 CLI，直接调用 `src/hand/paili.ts` 的向听和进张分析。

```bash
npm run paili -- 3456m3455p123788s
npm run paili -- 3456m3455p123788s 0
npm run paili -- 3456m3455p123788s 1
```

参数：

- 第 1 个位置参数：手牌字符串，默认 `3456m3455p123788s`。
- 第 2 个位置参数：向听模式，默认 `0`。

模式：

- `0`：同时计算一般形、七对子和国士无双。
- `1`：只计算一般形。

输出：

- 第一行是牌理分析 JSON。
- 第二行是 `Calculation time`，用于粗略观察计算耗时。

## analyze

通用手牌分析 CLI，按手牌张数自动区分进张分析和何切候选分析。

```bash
npm run analyze -- "123m456p789s1z"
npm run analyze -- "3456m3455p123788s"
npm run analyze -- "手牌: 3456m 3455p 123788s" 0 --verbose
```

参数：

- 第 1 个位置参数：手牌文本，默认 `123m456p789s1z`。
- 第 2 个位置参数：向听模式，默认 `0`。
- `--verbose`：输出底层分析细节。

行为：

- `3n+1` 手牌返回 `kind: "draw"`，包含当前向听、进张列表和总进张数。
- `3n+2` 手牌返回 `kind: "discard"`，包含各切牌候选和推荐切牌。

`analyze` 只做牌理层分析，不接入策略评分、EV 或局况判断。

## nanikiru

何切专用 CLI，内部调用 `analyzeNanikiru`，在牌理候选之上叠加策略评分、解释和默认 EV 二次仲裁。

```bash
npm run nanikiru -- "3456m3455p123788s"
npm run nanikiru -- "手牌: 3456m 3455p 123788s" --mode 0 --verbose
npm run nanikiru -- "234m456p778s22z" --call pon:555z --seat 2z --round 1z --dora 1m
npm run nanikiru -- "3456m3455p123788s" --no-ev-decision
```

位置参数：

- `text`：需要切一张牌的 `3n+2` 手牌文本，默认 `3456m3455p123788s`。

参数：

- `--mode 0|1`：向听模式。`0` 为一般形、七对子、国士综合；`1` 为一般形。
- `--verbose`：输出完整候选列表和更多调试字段。
- `--call <call>`：自家副露，可重复。
- `--seat <wind>`：自风，`1z-4z`。
- `--round <wind>`：场风，`1z-4z`。
- `--honba <number>`：本场数。
- `--turn <number>`：巡目。
- `--riichi-sticks <number>`：立直棒数。
- `--dora <tiles>`：宝牌指示牌。
- `--ura <tiles>`：里宝牌指示牌。
- `--no-kuitan`：关闭食断。
- `--double-yakuman`：开启双倍役满规则。
- `--no-ev-decision`：关闭 EV 二次仲裁，只使用原策略排序。

输出重点：

- `recommendation`：推荐切牌。
- `recommendedCandidate`：推荐候选的向听、进张、分数、分项和 reasons。
- `explanation`：中文解释。
- `candidates`：完整候选列表，默认不返回，`--verbose` 时返回。
- `estimate`：推荐候选的 EV 估算。默认可能出现在推荐候选上；关闭 EV 时不生成。

适用边界：

- 只接受需要切牌的 `3n+2` 手牌。
- 副露后手牌的闭合部分可以少于 14 张，副露通过 `--call` 表达。
- 自然语言何切题解析尚未实现，当前只从文本中提取牌组。

## score

计分 CLI，内部调用 `scoreHand` 和 `calculateAgariScore`。

```bash
npm run score -- "123m456m789p234s22z" 4s ron --riichi --seat 3z --round 1z
npm run score -- "123m456p789s77s" 3m ron --call pon:555z
npm run score -- "123m406m789p234s22z" 4s ron --riichi --dora 1z --ura 1s --verbose
```

位置参数：

- 第 1 个位置参数：闭合手牌文本，默认 `123m456m789p234s22z`。
- 第 2 个位置参数：和牌牌，默认 `4s`。
- 第 3 个位置参数：和牌方式，`ron` 或 `tsumo`，默认 `ron`。

参数：

- `--riichi`
- `--double-riichi`
- `--ippatsu`
- `--rinshan`
- `--chankan`
- `--haitei`
- `--houtei`
- `--tenhou`
- `--chiihou`
- `--verbose`
- `--call <call>`：副露，可重复。
- `--seat <wind>`：自风。
- `--round <wind>`：场风。
- `--honba <number>`：本场数。
- `--riichi-sticks <number>`：立直棒数。
- `--dora <tiles>`：宝牌指示牌。
- `--ura <tiles>`：里宝牌指示牌。
- `--double-yakuman`：开启双倍役满规则。

返回状态：

- `not_agari`：无法分解为和牌形。
- `invalid_context`：上下文矛盾，不能计分。
- `no_yaku`：可以和牌但没有起和役。
- `scored`：存在有效计分候选，`best` 为最高点结果。

详细计分边界见 [scoring.md](./scoring.md)。

## estimate

局面快速估算 CLI，当前用于对切牌候选估算和牌率、放铳率、期望点和局收支。它不是完整四人搜索。

```bash
npm run estimate -- "345m35p13789s1234z" --draw 5p --turn 8 --dora 1m
npm run estimate -- --hand "345m35p13789s1234z" --discard 9s --include-candidates
npm run estimate -- --state examples/decide-state.example.json --mode fast
```

输入模式：

- 轻量模式：使用位置参数或 `--hand` 构造简化 `GameState`。
- 完整模式：使用 `--state <path>` 读取完整 `GameState` JSON。

参数：

- `--hand <tiles>`：自家手牌。
- `--state <path>`：完整局面 JSON 文件。
- `--mode fast|balanced|deep`：估算模式。当前实现以快速启发式为主。
- `--discard <tile>`：只估算指定切牌。
- `--draw <tile>`：自摸牌。
- `--turn <number>`：巡目，默认 `8`。
- `--dora <tiles>`：宝牌指示牌。
- `--include-candidates`：输出更多候选估算。

输出包含：

- 推荐或指定动作。
- `winRate`：和牌率估算。
- `dealInRate`：放铳率估算。
- `expectedAgariPoints`：自家和牌时的期望得点。
- `expectedRoundIncome`：本局点棒收支估算。
- `confidence`、`assumptions`、`warnings`：置信度、假设和警告。

## decide

统一当前局面动作推荐 CLI，内部调用 `chooseAction(state)`。这是目前最接近实战决策的入口。

```bash
npm run decide -- "345m35p13789s1234z" --draw 5p --turn 9
npm run decide -- "345m35p13789s1234z" --last-discard 5z --last-discard-from left
npm run decide -- "345m35p13789s1234z" --turn 9 --left-riichi --left-discards 4z6m9p
npm run decide -- --state examples/decide-state.example.json --verbose --include-estimate
```

输入模式：

- 轻量参数模式：从命令行参数构造常见 `GameState`。
- 完整 JSON 模式：`--state <path>` 读取完整 `GameState`。抢杠、岭上、自定义 `phase`、副露后切牌等阶段建议使用该模式。

自家参数：

- 位置参数：自家手牌，默认 `345m35p13789s1234z`。
- `--draw <tile>`：自摸牌。
- `--last-discard <tile>`：最近他家打出的牌。
- `--last-discard-from left|across|right`：最近弃牌来源，默认 `right`。
- `--call <call>`：自家副露，可重复。
- `--seat <wind>`：自风，默认 `1z`。
- `--points <number>`：自家点数，默认 `25000`。

场况参数：

- `--round <wind>`：场风，默认 `1z`。
- `--kyoku <number>`：局数，默认 `1`。
- `--turn <number>`：巡目，默认 `8`。
- `--honba <number>`：本场数，默认 `0`。
- `--riichi-sticks <number>`：立直棒数，默认 `0`。
- `--dora <tiles>`：宝牌指示牌。
- `--no-kuitan`：关闭食断。
- `--double-yakuman`：开启双倍役满。
- `--include-estimate`：额外输出推荐候选的 EV 明细。
- `--no-ev-decision`：关闭 EV 二次仲裁。
- `--verbose`：输出完整 `analysis`。

对手方向：

- `left`：上家。
- `across`：对家。
- `right`：下家。

每个方向支持：

- `--left-riichi`、`--across-riichi`、`--right-riichi`
- `--left-discards <tiles>`、`--across-discards <tiles>`、`--right-discards <tiles>`
- `--left-call <call>`、`--across-call <call>`、`--right-call <call>`
- `--left-points <number>`、`--across-points <number>`、`--right-points <number>`
- `--left-seat <wind>`、`--across-seat <wind>`、`--right-seat <wind>`

输出字段：

- `phase`：决策阶段。
- `mode`：策略模式，`attack`、`balance`、`defense` 或 `push`。
- `action`：推荐动作。
- `explanation`：中文解释。
- `recommendedCandidate`：推荐切牌候选的核心信息。
- `riichiPlanDecision`：立直/默听计划信息。
- `estimate`：使用 `--include-estimate` 时输出。
- `analysis`：使用 `--verbose` 时输出。

完整 `GameState` 字段：

- `phase`：可选，`self_draw`、`opponent_discard`、`chankan`、`rinshan_draw`、`after_call_discard`。
- `round`：`bakaze`、`kyoku`、`honba`、`riichiSticks`、`turn`。
- `self`：自家 `PlayerState`。
- `opponents`：三家 `PlayerState[]`。推荐顺序为 `[left, across, right]`，但行动来源以 `playerIndex` 为准。
- `doraIndicators`：宝牌指示牌。
- `visibleTiles`：34 维可见牌计数。
- `lastDraw`：自摸牌。
- `lastDiscard`：最近弃牌事件，包含 `tile`、`tsumogiri`、`playerIndex`。
- `lastKan`：最近杠事件，抢杠和岭上阶段使用。
- `forbiddenDiscards`：副露后食替限制。
- `temporaryFuriten`：临时振听。
- `riichiFuriten`：立直见逃振听。
- `rules`：规则配置。

`PlayerState` 字段：

- `seatWind`
- `points`
- `hand`
- `calls`
- `discards`
- `riichi`
- `ippatsu`
- `menzen`

`decide` 的动作范围：

- 自家摸牌后：自摸、立直、暗杠、加杠、切牌。
- 他家打牌后：荣和、吃、碰、大明杠、不鸣。
- 抢杠阶段：荣和或不和。
- 岭上阶段：岭上自摸、切牌和可行杠动作。
- 副露后切牌阶段：只生成合法切牌。

## 测试命令

```bash
npm run check
npm test
npm run test:fast
npm run test:slow
npm run test:actions
```

- `test:actions`：动作仲裁专项测试。
- `test:fast`：日常轻量回归。
- `test:slow`：副露、立直计划、二层估值和完整 `chooseAction` 慢测。
