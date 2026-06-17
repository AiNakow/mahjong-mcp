# M7 Agent 兼容适配层实施方案

本文是 M7 阶段的详细实施方案。目标是在不改变现有麻将核心能力的前提下，为现代 Agent 提供稳定、结构化、可复用的接入层。

当前项目已经完成确定性牌理、计分、何切策略、统一动作仲裁、EV 快速估算和 CLI 服务。M7 不重新实现麻将逻辑，而是把现有能力收敛成统一服务 facade、共享 JSON Schema、HTTP API、MCP server 以及 OpenAI/Anthropic tools schema。

## 当前基础

已可复用模块：

- `src/core/`：`TileId`、`GameState`、`PlayerState`、`Call`、`RuleConfig` 等核心类型。
- `src/hand/`：向听、进张、何切底层牌理。
- `src/scoring/`：和牌分解、役种、符番点数和上下文校验。
- `src/strategy/`：`chooseAction(state)`、合法动作、动作仲裁、何切评分、副露、立直、防守、EV 二次仲裁。
- `src/ev/`：快速和牌率、放铳率、局收支估算。
- `src/service/`：现有 CLI facade，包括 `analyze`、`nanikiru`、`score`、`estimate`、`decide`。
- `docs/cli.md`：现有 CLI 输入输出边界。
- `docs/architecture.md`：当前模块职责。

尚未完成的 M7 内容：

- 统一服务层 API。
- 共享 JSON Schema。
- HTTP API 和 `openapi.json`。
- MCP server。
- OpenAI / Anthropic tools schema 适配。
- 适配层一致性测试。

## 设计目标

M7 交付后，外部 Agent 应能通过以下任一方式调用同一套麻将引擎：

```text
Agent
  -> MCP tools
  -> HTTP API
  -> OpenAI/Anthropic tools schema
  -> CLI --json
  -> shared service facade
  -> hand/scoring/strategy/ev core
```

核心原则：

- 适配层只做协议转换、校验、序列化和错误映射，不做麻将判断。
- 所有入口共享同一套服务 facade，避免 CLI、HTTP、MCP 结果漂移。
- 所有公开请求和响应都由 TypeScript 类型和 JSON Schema 描述。
- 结构化结果优先，自然语言解释作为响应字段之一。
- 不支持截图识别前，图片相关接口先返回明确的 `unsupported` 或 `not_implemented` 错误。
- 适配层必须可测试，不依赖真实 LLM 平台完成核心验收。

## 目标能力范围

M7 首版应覆盖当前已经实现的能力：

- 纯手牌牌理分析：`analyzeHandText`。
- 何切推荐：`analyzeNanikiru`。
- 和牌计分：`scoreHand`。
- 当前局面动作推荐：`chooseAction`。
- 局收支估算：`estimateRound` / 现有 `estimate` 服务能力。

暂不在 M7 首版实现：

- 截图识别。
- 完整自然语言题面解析。
- 自动对局循环。
- 多 Agent session 记忆或外部牌谱状态同步。

但 M7 的 schema 和接口需要预留 `image`、`warnings`、`assumptions`、`unsupported` 状态，避免后续扩展破坏协议。

## 模块规划

新增目录建议：

```text
src/
  service/
    facade.ts
    errors.ts
    requests.ts
    responses.ts
  schemas/
    build-schemas.ts
    registry.ts
    json/
      tile.schema.json
      game-state.schema.json
      analyze-hand-request.schema.json
      nanikiru-request.schema.json
      score-hand-request.schema.json
      choose-action-request.schema.json
      estimate-request.schema.json
      common-response.schema.json
  adapters/
    http/
      server.ts
      routes.ts
      openapi.ts
    mcp/
      server.ts
      tools.ts
    tools/
      openai.ts
      anthropic.ts
  service/
    facade-cli.ts
tests/
  adapter-facade.test.ts
  adapter-schema.test.ts
  adapter-http.test.ts
  adapter-tools.test.ts
```

如果希望保持 `src/service/` 更轻，也可以把 `facade.ts` 放入 `src/adapters/facade.ts`。推荐放在 `service`，因为它是 CLI、HTTP、MCP 共用的应用服务边界。

## 统一服务 facade

### 目标

把现有分散服务入口收敛成稳定函数：

```ts
analyzeHand(request: AnalyzeHandRequest): ServiceResult<AnalyzeHandResponse>
analyzeNanikiruRequest(request: NanikiruRequest): ServiceResult<NanikiruResponse>
scoreHandRequest(request: ScoreHandRequest): ServiceResult<ScoreHandResponse>
chooseActionRequest(request: ChooseActionRequest): ServiceResult<ChooseActionResponse>
estimateRequest(request: EstimateRequest): ServiceResult<EstimateResponse>
```

facade 应负责：

- 输入结构标准化。
- 调用现有服务或核心函数。
- 捕获错误并转换为稳定 `ServiceError`。
- 补齐 `warnings`、`assumptions`、`meta`。
- 控制 `verbose`、`includeCandidates`、`includeRaw` 等输出规模。

facade 不负责：

- 重新计算向听、计分、策略。
- 渲染不同平台专用文案。
- 保存外部会话状态。

### 通用返回包装

所有公开入口统一返回：

```ts
interface ServiceSuccess<T> {
  ok: true;
  data: T;
  warnings: ServiceWarning[];
  meta: ServiceMeta;
}

interface ServiceFailure {
  ok: false;
  error: ServiceError;
  warnings: ServiceWarning[];
  meta: ServiceMeta;
}

type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;
```

`ServiceMeta` 建议字段：

- `requestId`：可选，由 HTTP/MCP 层传入或生成。
- `engineVersion`：来自 `package.json`。
- `elapsedMs`：facade 层总耗时。
- `source`：`cli`、`http`、`mcp`、`openai_tool`、`anthropic_tool`、`library`。

`ServiceError` 建议字段：

- `code`：稳定错误码。
- `message`：给用户或 Agent 可读的中文说明。
- `details`：结构化调试信息，默认精简。
- `retryable`：是否建议重试。

错误码首版：

- `invalid_input`：请求结构错误。
- `invalid_tile`：牌编码非法。
- `invalid_hand`：手牌张数或结构非法。
- `invalid_state`：`GameState` 缺少必要字段或矛盾。
- `invalid_context`：计分上下文矛盾。
- `unsupported`：接口预留但当前不支持。
- `not_implemented`：规划中但尚未实现。
- `internal_error`：未预期错误。

## 请求与响应设计

### AnalyzeHandRequest

用途：通用牌理分析，对应现有 `analyzeHandText`。

```ts
interface AnalyzeHandRequest {
  text: string;
  mode?: 0 | 1;
  unavailableTiles?: TileId[];
  verbose?: boolean;
}
```

响应直接复用现有 `HandAnalysis` 结构，但需包装进 `ServiceResult`。

### NanikiruRequest

用途：何切推荐，对应现有 `analyzeNanikiru`。

```ts
interface NanikiruRequest {
  text: string;
  mode?: 0 | 1;
  context?: {
    calls?: Call[];
    seatWind?: WindTile;
    bakaze?: WindTile;
    kyoku?: number;
    points?: number;
    opponents?: NanikiruOpponent[];
    honba?: number;
    turn?: number;
    riichiSticks?: number;
    doraIndicators?: TileId[];
    uraDoraIndicators?: TileId[];
    akaDoraCount?: number;
    rules?: Partial<RuleConfig>;
  };
  policy?: Partial<NanikiruPolicy>;
  options?: {
    includeCandidates?: boolean;
    verbose?: boolean;
    useEvDecision?: boolean;
  };
}
```

响应重点字段：

- `recommendation`
- `recommendedCandidate`
- `riichiPlanDecision`
- `explanation`
- `candidates`，仅在请求开启时返回。

### ScoreHandRequest

用途：和牌计分，对应现有 `scoreHand`。

保留当前服务入参语义：

- `hand`
- `winningTile`
- `winType`
- `calls`
- `seatWind`
- `bakaze`
- `honba`
- `riichiSticks`
- `doraIndicators`
- `uraDoraIndicators`
- `riichi`
- `doubleRiichi`
- `ippatsu`
- `rinshan`
- `chankan`
- `haitei`
- `houtei`
- `tenhou`
- `chiihou`
- `rules`
- `options`

响应保留：

- `status`
- `best`
- `candidates`，按选项返回。
- `warnings`

### ChooseActionRequest

用途：完整局面动作推荐，对应 `chooseAction(state)`。

```ts
interface ChooseActionRequest {
  state: GameState;
  policy?: Partial<NanikiruPolicy>;
  options?: {
    useEvDecision?: boolean;
    includeCandidates?: boolean;
    includeAnalysis?: boolean;
    includeEstimate?: boolean;
  };
}
```

响应字段：

- `phase`
- `mode`
- `action`
- `explanation`
- `recommendedCandidate`
- `riichiPlanDecision`
- `estimate`
- `candidates`，按选项返回。
- `analysis`，按选项返回。

注意：当前 `chooseAction` 默认返回完整 `candidates` 和 `analysis`。facade 需要做输出裁剪，避免 HTTP/MCP 默认响应过大。

### EstimateRequest

用途：快速局收支估算。

首版优先支持完整 `GameState + action`：

```ts
interface EstimateRequest {
  state: GameState;
  action?: EstimateAction;
  mode?: "fast" | "balanced" | "deep";
  options?: {
    includeCandidates?: boolean;
  };
}
```

CLI 的轻量参数构造逻辑可以继续留在 CLI，不强行放进公共 API。HTTP/MCP 面向 Agent 时优先要求结构化 `GameState`。

## JSON Schema 策略

### 生成方式

当前项目没有 schema 生成依赖。可选路径：

1. 手写 schema，避免新增依赖，首版更快落地。
2. 引入 `ts-json-schema-generator` 或 `typescript-json-schema`，从类型生成 schema。

推荐首版手写核心 schema，再在后续评估生成工具。原因是现有类型中包含较多联合、内部细节和 `Partial<NanikiruPolicy>`，直接生成的 schema 可能过大且不适合作为 Agent tool 输入。

当前决策：

- 首版手写公开 API schema。
- 不从 TypeScript 内部类型自动生成 schema。
- schema 只覆盖对外协议所需字段，不把全部内部类型原样暴露给 Agent。

### Schema 注册表

新增 `src/schemas/registry.ts`：

```ts
export const schemas = {
  tileId,
  call,
  discard,
  ruleConfig,
  gameState,
  analyzeHandRequest,
  nanikiruRequest,
  scoreHandRequest,
  chooseActionRequest,
  estimateRequest,
};
```

所有适配层从 registry 读取 schema：

- HTTP 用于请求校验和 OpenAPI。
- MCP 用于 tool `inputSchema`。
- OpenAI tools 用于 `parameters`。
- Anthropic tools 用于 `input_schema`。

### 校验策略

由于 Node 标准库不包含 JSON Schema validator，M7 决定引入 `ajv` 做运行时校验。原因是 schema 同时服务 HTTP、MCP、OpenAI tools、Anthropic tools 和 OpenAPI，如果再手写一套 validator，后续很容易出现 schema 与真实校验逻辑漂移。

新增依赖后需要在 `package.json` 写明：

```json
"dependencies": {
  "ajv": "^8.x"
}
```

运行时至少校验：

- `TileId` 格式和赤五格式。
- `Counts34` 长度为 34。
- `GameState` 必需字段。
- `opponents` 长度为 3。
- `phase`、`wind`、`call.type`、`call.from` 枚举。

## HTTP API

### 运行方式

建议新增：

```json
"http": "node src/adapters/http/server.ts"
```

当前决策：首版使用 Node 内置 `http` 模块，不引入 Fastify、Express 或其他 HTTP 框架。M7 的 HTTP 路由数量有限，内置模块足够支撑 JSON body、路由分发、错误映射、body size limit 和 `/openapi.json`。

后续只有在出现以下需求时再考虑引入 Web 框架：

- 路由数量明显增加。
- 需要 multipart/form-data 上传截图。
- 需要更复杂的中间件、认证、限流或流式响应。
- 需要更成熟的 OpenAPI 集成。

### 路由

```text
GET  /health
GET  /openapi.json
POST /v1/mahjong/analyze-hand
POST /v1/mahjong/nanikiru
POST /v1/mahjong/score-hand
POST /v1/mahjong/choose-action
POST /v1/mahjong/estimate
POST /v1/mahjong/parse-screenshot
```

`parse-screenshot` 首版返回：

```json
{
  "ok": false,
  "error": {
    "code": "not_implemented",
    "message": "截图识别尚未实现。"
  }
}
```

### HTTP 状态码

- `200`：业务成功，`ok: true`。
- `400`：输入非法，`invalid_input`、`invalid_tile`、`invalid_hand`、`invalid_state`。
- `422`：上下文矛盾，`invalid_context`。
- `501`：尚未实现，`not_implemented`。
- `500`：未预期错误，`internal_error`。

响应体始终使用 `ServiceResult` 包装，方便 Agent 稳定解析。

### OpenAPI

新增 `src/adapters/http/openapi.ts`，从 schema registry 组装 `openapi.json`。

OpenAPI 必须包含：

- API title、version。
- 每个 endpoint 的 request schema。
- 成功响应 schema。
- 错误响应 schema。
- 示例请求和示例响应。

`GET /openapi.json` 直接返回该对象。

## MCP Server

### 工具列表

MCP tools 首版建议：

- `mahjong_analyze_hand`
- `mahjong_nanikiru`
- `mahjong_score_hand`
- `mahjong_choose_action`
- `mahjong_estimate`
- `mahjong_parse_screenshot`

不建议首版拆太细，例如单独暴露 `evaluate_discards`、`explain_decision`，因为当前公开价值最高的是稳定顶层能力。后续需要时再扩展。

### Tool 输入输出

每个 tool：

- `inputSchema` 来自 `src/schemas/registry.ts`。
- handler 调用 `src/service/facade.ts`。
- 返回结构化 JSON。
- 自然语言解释保留在 `data.explanation`。

MCP 返回时可同时提供一段简短文本摘要，方便宿主直接展示，但必须包含完整 JSON。

### 运行方式

建议新增：

```json
"mcp": "node src/adapters/mcp/server.ts"
```

当前决策：MCP server 使用官方 TypeScript SDK，不手写 MCP JSON-RPC/stdin-stdout 协议。原因是 MCP 协议和宿主兼容性细节不应由本项目维护，适配层只负责把 tools 映射到统一 facade。

MCP SDK 需要新增依赖：

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.x"
}
```

### MCP 错误处理

Tool handler 不直接 throw 业务错误，而是返回：

```json
{
  "ok": false,
  "error": {
    "code": "invalid_hand",
    "message": "..."
  }
}
```

只有协议级异常才 throw，例如 JSON-RPC 无法解析。

## OpenAI / Anthropic Tools Schema

### 输出文件

新增：

```text
src/adapters/tools/openai.ts
src/adapters/tools/anthropic.ts
```

OpenAI tool 示例：

```ts
export const openAITools = [
  {
    type: "function",
    function: {
      name: "mahjong_choose_action",
      description: "根据立直麻将 GameState 推荐当前合法动作，并返回结构化候选和中文解释。",
      parameters: schemas.chooseActionRequest,
    },
  },
];
```

Anthropic tool 示例：

```ts
export const anthropicTools = [
  {
    name: "mahjong_choose_action",
    description: "根据立直麻将 GameState 推荐当前合法动作，并返回结构化候选和中文解释。",
    input_schema: schemas.chooseActionRequest,
  },
];
```

### Handler 映射

工具 schema 只描述平台工具，不绑定某个 SDK。另提供纯函数映射：

```ts
executeTool(name: string, input: unknown): Promise<ServiceResult<unknown>>
```

这样 OpenAI Responses API、Anthropic Messages API、LangChain 或自定义 Agent 都可以复用同一处理逻辑。

## CLI 调整

现有 CLI 已默认输出 JSON，M7 需要补齐两点：

1. 所有 CLI 的错误输出映射到统一 `ServiceError`。
2. 增加统一 facade CLI，便于 Agent 只记一个入口。

建议新增：

```json
"tool": "node src/service/facade-cli.ts"
```

用法：

```bash
npm run tool -- choose-action --input state.json
npm run tool -- nanikiru --input request.json
npm run tool -- score-hand --input request.json
```

标准输出始终为 `ServiceResult` JSON。现有 `nanikiru`、`score`、`decide` CLI 保持兼容，不强制迁移。

## 安全与资源控制

Agent 适配层容易被传入大 JSON 或昂贵请求。M7 需要设置基础限制：

- HTTP 请求体默认最大 1 MB。
- MCP tool 输入同样做 size guard。
- `includeCandidates`、`includeAnalysis`、`verbose` 默认关闭。
- `chooseAction` 和 `nanikiru` 允许通过 options 关闭 EV。
- facade 记录 `elapsedMs`，超过阈值时加入 warning。
- 不执行任意文件读取，除统一 facade CLI 的 `--input` 本地文件外。
- HTTP 首版只监听 `127.0.0.1`，除非显式传入 `--host 0.0.0.0`。

## 测试计划

### Facade 单元测试

新增 `tests/adapter-facade.test.ts`：

- `analyzeHand` 成功返回 `ok: true`。
- `nanikiru` 默认不返回全候选，开启后返回。
- `scoreHand` 能返回 `scored`。
- `chooseAction` 能返回结构化 action。
- 非法牌返回 `ok: false` 和稳定错误码。
- `parseScreenshot` 返回 `not_implemented`。

### Schema 测试

新增 `tests/adapter-schema.test.ts`：

- schema registry 能加载所有 schema。
- 每个 tool schema 都有 `type: "object"`。
- `GameState` 示例能通过校验。
- 缺少必要字段会失败。
- OpenAI/Anthropic tool 输出引用同一 schema。

### HTTP 测试

新增 `tests/adapter-http.test.ts`：

- 启动本地测试 server。
- `GET /health` 返回正常。
- `GET /openapi.json` 返回 OpenAPI 结构。
- `POST /v1/mahjong/nanikiru` 返回推荐。
- 非法请求返回 `400` 和 `ServiceFailure`。

### MCP 测试

新增 `tests/adapter-mcp.test.ts`：

- tools 列表包含预期工具。
- 每个 tool 有 input schema。
- 直接调用 handler 返回 `ServiceResult`。

如果真实 stdio server 难以在单元测试中稳定运行，首版可把 handler 和 server wiring 分开测试，后续补 e2e。

### 一致性测试

同一 fixture 分别通过 facade、HTTP route handler、MCP handler、OpenAI tool handler 调用，断言关键字段一致：

- 推荐牌或动作一致。
- `phase`、`mode` 一致。
- `scoreHand.best.points.total` 一致。
- 错误码一致。

## 实施顺序

### Step 1：抽出 facade 和错误模型

交付：

- `src/service/errors.ts`
- `src/service/requests.ts`
- `src/service/responses.ts`
- `src/service/facade.ts`
- facade 单元测试。

验收：

- `npm run check` 通过。
- facade 能覆盖 `analyze`、`nanikiru`、`score`、`chooseAction`、`estimate`。
- 非法输入不会向外抛出原始异常。

### Step 2：建立 schema registry

交付：

- `src/schemas/registry.ts`
- `src/schemas/json/*.schema.json`
- schema 测试。

验收：

- 公开请求均有 schema。
- MCP/OpenAI/Anthropic 能直接复用 schema 对象。
- 示例 `examples/decide-state.example.json` 能作为 `ChooseActionRequest.state` 使用。

### Step 3：统一 facade CLI

交付：

- `src/service/facade-cli.ts`
- `npm run tool`
- `docs/cli.md` 更新。

验收：

- `npm run tool -- nanikiru --input request.json` 返回 `ServiceResult`。
- 错误码和 facade 单测一致。

### Step 4：HTTP API 和 OpenAPI

交付：

- `src/adapters/http/server.ts`
- `src/adapters/http/routes.ts`
- `src/adapters/http/openapi.ts`
- `npm run http`
- HTTP 测试。

验收：

- 本地启动后可访问 `/health` 和 `/openapi.json`。
- `choose-action`、`nanikiru`、`score-hand` 至少三个端点可用。
- 错误请求有稳定 HTTP 状态码和错误体。

### Step 5：Tools schema

交付：

- `src/adapters/tools/openai.ts`
- `src/adapters/tools/anthropic.ts`
- `executeTool(...)`
- tool schema 测试。

验收：

- 导出的工具数组可直接被平台 SDK 消费。
- `executeTool("mahjong_choose_action", input)` 与 facade 输出一致。

### Step 6：MCP server

交付：

- `src/adapters/mcp/tools.ts`
- `src/adapters/mcp/server.ts`
- `npm run mcp`
- MCP handler 测试。

验收：

- MCP tools 列表完整。
- 至少 `mahjong_nanikiru` 和 `mahjong_choose_action` 可通过 MCP handler 返回推荐。
- 支持 MCP 的宿主可通过 stdio server 调用工具。

### Step 7：文档和示例

交付：

- `docs/agent-adapter.md` 或更新本文为实现文档。
- `README.md` 文档入口更新。
- `examples/agent/` 示例请求：
  - `nanikiru-request.json`
  - `choose-action-request.json`
  - `score-hand-request.json`
  - `openai-tools-example.ts`
  - `anthropic-tools-example.ts`

验收：

- 用户能按文档启动 HTTP/MCP。
- Agent 集成者能直接复制 schema 和示例请求。

## package.json 建议

M7 完成后建议脚本：

```json
{
  "scripts": {
    "tool": "node src/service/facade-cli.ts",
    "http": "node src/adapters/http/server.ts",
    "mcp": "node src/adapters/mcp/server.ts",
    "test:adapters": "node --test tests/adapter-*.test.ts"
  }
}
```

可选依赖：
必需运行时依赖：

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "ajv": "^8.x"
  }
}
```

HTTP 首版不引入 Web 框架；`ajv` 用于 JSON Schema 运行时校验；`@modelcontextprotocol/sdk` 用于 MCP stdio server 和 tool 协议实现。

安装最新版依赖命令：

```bash
npm install ajv@latest @modelcontextprotocol/sdk@latest
```

## 公开协议版本

建议给适配层协议单独定义版本：

```ts
export const ADAPTER_API_VERSION = "v1";
```

规则：

- 新增可选字段不升主版本。
- 删除字段、改变字段语义、改变错误码需要升主版本。
- HTTP 路由使用 `/v1/mahjong/...`。
- MCP tool 名首版不带版本；若后续破坏兼容，新增 `mahjong_v2_choose_action`，保留旧工具一段时间。

## 与截图识别的衔接

M7 不实现截图识别，但要为 M6/M8 后续接入留接口：

```ts
interface ParseScreenshotRequest {
  imageBase64?: string;
  imageUrl?: string;
  layoutHint?: "majsoul" | "tenhou" | "mortal" | "unknown";
}
```

首版返回 `not_implemented`。未来实现后输出：

- `parsedTable`
- `state`
- `confidence`
- `alternatives`
- `warnings`

`chooseActionRequest` 后续可增加：

```ts
interface ChooseActionRequest {
  state?: GameState;
  text?: string;
  image?: ParseScreenshotRequest;
}
```

但首版为了降低歧义，`chooseAction` 只接受 `state`，何切文本走 `nanikiru`。

## 风险与处理

主要风险：

- schema 手写后与 TypeScript 类型漂移。
- HTTP、MCP、tools 三套适配重复逻辑。
- `chooseAction` 默认响应较大，不适合 Agent tool。
- 引入 MCP SDK 和 Ajv 后依赖管理变复杂，但可避免手写协议和手写校验造成更高维护成本。
- 自然语言题面解析未实现，Agent 可能传入非结构化文本。

处理方式：

- schema registry 单一来源，所有适配层只引用 registry。
- handler 统一调用 facade，不在适配层写业务逻辑。
- 默认响应裁剪，只在显式 options 下返回完整候选。
- 依赖引入集中在 M7，固定为 `ajv` 和官方 MCP SDK；HTTP 不引入框架。
- 文档明确：自然语言题面首版仅支持从文本中提取牌组，复杂场况需传结构化 `context` 或 `GameState`。

## M7 验收清单

- `npm run check` 通过。
- `npm test` 通过，或新增 `test:adapters` 与现有测试分组全部通过。
- `npm run tool -- nanikiru --input examples/agent/nanikiru-request.json` 返回推荐。
- `npm run http` 启动后 `/openapi.json` 可访问。
- HTTP `POST /v1/mahjong/choose-action` 返回与 facade 一致的动作。
- OpenAI tools schema 和 Anthropic tools schema 导出成功。
- MCP tools 至少能列出并调用 `mahjong_nanikiru`、`mahjong_choose_action`。
- 任意适配层调用同一 fixture 的推荐动作一致。
- 文档说明当前不支持截图识别和复杂自然语言解析。

## 当前实现状态

已完成：

- `src/service/facade.ts`：统一 service facade，覆盖 `analyze-hand`、`nanikiru`、`score-hand`、`choose-action`、`estimate`、`parse-screenshot`。
- `src/service/errors.ts` / `responses.ts` / `requests.ts`：统一错误、请求和 `ServiceResult` 输出模型。
- `src/schemas/registry.ts`：手写公开 API JSON Schema，并使用 `ajv` 进行运行时校验。
- `src/adapters/tools/openai.ts` 和 `anthropic.ts`：导出 OpenAI / Anthropic tool schema。
- `src/adapters/tools/execute.ts`：统一工具执行器。
- `src/service/facade-cli.ts`：统一 `npm run tool` CLI。
- `src/adapters/http/`：Node 内置 `http` 版 HTTP API、路由和 OpenAPI 文档生成。
- `src/adapters/mcp/`：基于官方 MCP SDK 的 stdio server 和 JSON Schema tool 注册。
- `npm run test:adapters`：适配层专项测试。
- `examples/agent/*.json`：统一 facade CLI 和 Agent 适配层示例请求。
- HTTP server e2e 测试：测试中启动本地 server，验证 `/health`、`/openapi.json` 和 POST 路由。
- MCP handler 测试：直接验证 tool 调用返回 MCP content 和 JSON `ServiceResult`。
- `CandidateAction` schema：已按动作类型拆分联合分支，避免只校验 `type`。
- OpenAPI 响应：已补通用 `ServiceResult` / `ServiceFailure` 响应 schema。

仍待增强：

- 增加 MCP stdio 子进程级 e2e 测试；当前已测试 tool registry 和 handler，server wiring 由类型检查覆盖。
- 进一步收紧 `NanikiruPolicy`、`Reason`、`DecisionAction` 等输出侧 schema。
- 为 OpenAPI 增加更完整的业务响应 data schema，而不只是通用 `ServiceResult` 外壳。

## 推荐首个 PR 切分

为了降低风险，M7 建议拆成 4 个小 PR 或提交批次：

1. Facade + errors + adapter tests。
2. Schema registry + tools schema。
3. HTTP API + OpenAPI。
4. MCP server + 文档和示例。

这样每一步都能独立验证，并且不会在一次改动里同时引入协议、服务、依赖和文档风险。
