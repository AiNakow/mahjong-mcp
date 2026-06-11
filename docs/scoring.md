# 和牌分解与计分设计

本文记录 `src/scoring/` 的当前能力边界和后续扩展约定。该模块目标是提供可复用的立直麻将和牌分解、役种判断、符计算和点数计算基础工具。

## 入口

底层入口：

```ts
import { calculateAgariScore } from "../src/scoring/index.ts";

const result = calculateAgariScore({
  hand,
  winningTile: "4s",
  method: "ron",
  seatWind: "3z",
  bakaze: "1z",
  riichi: true,
});
```

服务入口：

```ts
import { scoreHand } from "../src/service/score-hand.ts";

const result = scoreHand({
  text: "123m456m789p234s22z",
  winningTile: "4s",
  method: "ron",
  seatWind: "3z",
  bakaze: "1z",
  riichi: true,
});
```

CLI：

```bash
npm run score -- "123m456m789p234s22z" 4s ron --riichi --seat 3z --round 1z
npm run score -- "123m406m789p234s22z" 4s ron --riichi --dora 1z --ura 1s
```

副露输入示例：

```bash
npm run score -- "123m456p789s77s" 3m ron --call pon:555z
npm run score -- "123p123s456m22z" 3s ron --call chi:123m:2m:left
```

## 返回状态

`calculateAgariScore` 和 `scoreHand` 都会返回：

- `status: "not_agari"`：无法分解成和牌形。
- `status: "invalid_context"`：上下文存在不能计分的矛盾输入。
- `status: "no_yaku"`：可以分解成和牌形，但没有起和役。
- `status: "scored"`：存在至少一个有效计分候选。

返回结构中：

- `warnings`：上下文校验结果。`severity: "error"` 时返回 `invalid_context`；`severity: "warning"` 时继续计分但提示字段被忽略或有冲突。
- `best`：最高点候选。只有 `status: "scored"` 时存在。
- `decompositions`：所有和牌分解候选。默认不返回；`verbose` 或 `includeDecompositions` 时返回。`not_agari` 时为空。
- `candidates`：有役且能计分的候选。默认不返回；`verbose` 或 `includeCandidates` 时返回。`not_agari` 和 `no_yaku` 时为空。
- `raw`：底层完整结果。默认不返回；`verbose` 或 `includeRaw` 时返回。

CLI 默认输出精简结果。需要调试分解和全部候选时使用：

```bash
npm run score -- "123m456m789p234s22z" 4s ron --riichi --seat 3z --round 1z --verbose
```

## AgariContext 字段

- `hand`：和牌后的门前手牌。服务层和 CLI 可用 `0m/0p/0s` 输入赤五，内部会规范化为 `5m/5p/5s`，并统计赤宝牌数量。
- `winningTile`：和牌牌。
- `method`：`ron` 或 `tsumo`。
- `calls`：副露信息，复用 `core/state.ts` 中的 `Call`。手牌 `hand`/`text` 只包含闭合部分，不包含副露牌。
- `bakaze`：场风，`1z/2z/3z/4z`。
- `seatWind`：自风，`1z/2z/3z/4z`。
- `riichi`、`doubleRiichi`、`ippatsu`、`rinshan`、`chankan`、`haitei`、`houtei`：上下文役状态。
- `tenhou`、`chiihou`：天和、地和状态。
- `honba`：本场数。
- `riichiSticks`：供托立直棒数。
- `doraIndicators`：宝牌指示牌。
- `uraDoraIndicators`：里宝牌指示牌。只有立直或两立直时计入，否则给 warning 并忽略。
- `akaDoraCount`：赤宝牌数量。服务层会从 `text` 中的 `0m/0p/0s` 自动统计；结构化调用仍可显式传入该字段作为兼容。只有 `rules.akaDora` 为 true 时计入，否则给 warning 并忽略。
- `rules.countDoubleYakuman`：是否把国士十三面、四暗刻单骑、纯正九莲宝灯、大四喜等按双倍役满结算。默认 `false`。

## 上下文校验

当前会返回 `invalid_context` 的错误：

- 明副露后声明立直或两立直。
- 同时声明立直和两立直。
- 未立直却声明一发。
- 天和不是庄家自摸。
- 地和由庄家声明。
- 地和不是自摸。
- 同时声明海底摸月和河底捞鱼。
- 同时声明岭上开花和抢杠。

当前会继续计分但返回 warning 的情况：

- 传入或解析到赤宝牌，但规则未启用赤宝牌。
- 未立直时传入里宝牌指示牌。

## 当前支持的分解

- 一般形：四面子一雀头。
- 七对子。
- 国士无双。
- 一般形会保留多候选分解。
- 等待类型：两面、嵌张、边张、单骑、双碰、国士十三面。

## 副露输入

结构化副露模型：

```ts
type CallType = "chi" | "pon" | "minkan" | "ankan" | "kakan";

interface Call {
  type: CallType;
  tiles: TileId[];
  calledTile?: TileId;
  from?: "left" | "across" | "right" | "self";
}
```

副露合法性：

- `chi` 必须是 3 张同花连续数牌。
- `pon` 必须是 3 张相同牌。
- `minkan`、`ankan`、`kakan` 必须是 4 张相同牌。
- 非法副露不会进入计分分解，结果会表现为 `status: "not_agari"`。

门清规则：

- 无副露是门清。
- 只有暗杠 `ankan` 仍视为门清。
- 吃、碰、明杠 `minkan`、加杠 `kakan` 视为非门清。

CLI 使用 `--call type:tiles[:calledTile[:from]]`：

- `--call pon:555z`
- `--call chi:789p:8p:left`
- `--call ankan:1111m`
- `--call minkan:9999p:9p:right`
- `--call kakan:2222s:2s:self`
- `--ura 123m`
- 赤宝牌在手牌或副露中写作 `0m/0p/0s`。

副露时部分役种会按规则减番或不成立：三色同顺、一气通贯、混全带幺九、纯全带幺九、混一色、清一色会按开门番数计算；平和、一杯口、二杯口、立直、两立直、门前清自摸只在门清时成立。断幺九是否允许副露成立由 `rules.kuitan` 控制。

## 当前支持的役

- 立直
- 两立直
- 一发
- 门前清自摸和
- 岭上开花
- 抢杠
- 海底摸月
- 河底捞鱼
- 断幺九
- 役牌：白、发、中、场风、自风
- 平和
- 七对子
- 一杯口
- 二杯口
- 对对和
- 三色同顺
- 三色同刻
- 一气通贯
- 混全带幺九
- 纯全带幺九
- 三暗刻
- 三杠子
- 小三元
- 混老头
- 混一色
- 清一色
- 国士无双
- 国士无双十三面
- 大三元
- 四暗刻
- 四暗刻单骑
- 字一色
- 清老头
- 小四喜
- 大四喜
- 绿一色
- 四杠子
- 九莲宝灯
- 纯正九莲宝灯
- 天和
- 地和

宝牌会计入翻数，但不作为起和役。宝牌输出会拆分为：

- `dora`：普通宝牌。
- `aka_dora`：赤宝牌。
- `ura_dora`：里宝牌。

默认不计双倍役满。开启 `rules.countDoubleYakuman` 后，国士十三面、四暗刻单骑、纯正九莲宝灯和大四喜会按双倍役满计算。

## 当前支持的符

- 平和荣和 30 符。
- 平和自摸 20 符。
- 七对子 25 符。
- 副底 20 符。
- 门清荣和加 10 符。
- 自摸加 2 符。
- 役牌雀头。
- 明刻、暗刻、明杠、暗杠。
- 单骑、嵌张、边张加 2 符。
- 荣和双碰时，和了刻子按明刻处理。
- 普通符数向上取整到 10 符。

## 当前支持的点数

- 普通点数公式。
- 荣和、自摸支付。
- 庄家、子家区分。
- 满贯、跳满、倍满、三倍满、数え役满。
- 役满和多倍役满。
- 本场。
- 立直棒。

## 已知限制

- 副露来源和加杠细节仍是基础版。
- 连风雀头是否 2 符或 4 符还没有规则配置化，当前按场风和自风分别加符。
- 计分 CLI 只做结构化参数解析，不做自然语言计分题解析。
