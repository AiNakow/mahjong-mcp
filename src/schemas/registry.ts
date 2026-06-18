import { Ajv, type ValidateFunction } from "ajv";

type JsonSchema = Record<string, unknown>;

const tileId = {
  type: "string",
  description: "立直麻将牌编码。1m-9m/1p-9p/1s-9s 表示数牌，1z-7z 表示东南西北白发中，0m/0p/0s 表示赤五。",
  pattern: "^(?:[1-9][mps]|[1-7]z|0[mps])$",
};

const windTile = {
  type: "string",
  description: "风牌编码：1z 东，2z 南，3z 西，4z 北。",
  enum: ["1z", "2z", "3z", "4z"],
};

const counts34 = {
  type: "array",
  description: "34 维可见牌计数，顺序为 1m-9m、1p-9p、1s-9s、1z-7z。",
  minItems: 34,
  maxItems: 34,
  items: { type: "integer", minimum: 0, maximum: 4 },
};

const ruleConfig = {
  type: "object",
  description: "立直麻将规则配置。",
  additionalProperties: false,
  properties: {
    akaDora: { type: "boolean" },
    kuitan: { type: "boolean" },
    doubleRon: { type: "boolean" },
    countDoubleYakuman: { type: "boolean" },
  },
  required: ["akaDora", "kuitan", "doubleRon", "countDoubleYakuman"],
};

const policyNumber = {
  type: "number",
  description: "策略评分参数覆盖值。通常不需要传；只有调试或定制策略时才覆盖。",
};

const nanikiruPolicy = {
  type: "object",
  description: "可选策略权重和阈值覆盖。只传需要覆盖的字段；未提供字段使用默认策略。",
  additionalProperties: false,
  properties: {
    shantenWeight: policyNumber,
    ukeireWeight: policyNumber,
    goodShapeWeight: policyNumber,
    shapeWeight: policyNumber,
    routeWeight: policyNumber,
    valueWeight: policyNumber,
    defenseWeight: policyNumber,
    yakuhaiPairBonus: policyNumber,
    tanyaoLeanBonus: policyNumber,
    chiitoiPairThreshold: policyNumber,
    chiitoiBonus: policyNumber,
    honitsuSuitThreshold: policyNumber,
    honitsuBonus: policyNumber,
    ittsuBonus: policyNumber,
    sanshokuBonus: policyNumber,
    chantaBonus: policyNumber,
    toitoiBonus: policyNumber,
    doraBonus: policyNumber,
    akaDoraBonus: policyNumber,
    doraSideBonus: policyNumber,
    compositeRouteBonus: policyNumber,
    useTwoLayerValueForIishanten: {
      type: "boolean",
      description: "是否在一向听价值评估中启用两层打点估算。",
    },
    twoLayerValueDivisor: policyNumber,
    twoLayerMinAveragePoints: policyNumber,
    twoLayerMaxDrawTypes: policyNumber,
    twoLayerMaxTenpaiDiscards: policyNumber,
    assumeRiichiForMenzenTwoLayer: {
      type: "boolean",
      description: "两层估算时是否默认门清听牌后可立直。",
    },
    secondaryValueRouteRatio: policyNumber,
    yakuhaiTanyaoConflictDecay: policyNumber,
    breakYakuhaiPairForTanyaoBonus: policyNumber,
    useScoringForTenpaiValue: {
      type: "boolean",
      description: "是否对听牌候选使用计分估算价值。",
    },
    scoringValueDivisor: policyNumber,
    sameShantenImprovementValueDivisor: policyNumber,
    sameShantenImprovementMinValue: policyNumber,
    sameShantenImprovementMaxDrawTypes: policyNumber,
    routeCommitmentBonus: policyNumber,
    routeImprovementBonus: policyNumber,
    routeBreakPenalty: policyNumber,
    shantenBackUkeireMultiplier: policyNumber,
    shantenBackGoodShapeMultiplier: policyNumber,
    shantenBackDefenseOverrideDelta: policyNumber,
    earlyLowValueTenpaiTurnMax: policyNumber,
    lowValueTenpaiWaitsMax: policyNumber,
    shantenBackImprovementMinWaits: policyNumber,
    shantenBackImprovementMinGoodShape: policyNumber,
    shantenBackImprovementShantenMultiplier: policyNumber,
    shantenBackImprovementUkeireMultiplier: policyNumber,
    shantenBackImprovementGoodShapeMultiplier: policyNumber,
  },
};

const call = {
  type: "object",
  description: "副露或杠的结构化表示。",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["chi", "pon", "minkan", "ankan", "kakan"] },
    tiles: { type: "array", items: tileId, minItems: 3, maxItems: 4 },
    calledTile: tileId,
    from: { type: "string", enum: ["left", "across", "right", "self"] },
  },
  required: ["type", "tiles"],
};

const discard = {
  type: "object",
  description: "一张弃牌及其是否摸切。",
  additionalProperties: false,
  properties: {
    tile: tileId,
    tsumogiri: { type: "boolean" },
  },
  required: ["tile", "tsumogiri"],
};

const discardEvent = {
  type: "object",
  additionalProperties: false,
  properties: {
    tile: tileId,
    tsumogiri: { type: "boolean" },
    playerIndex: { type: "integer", minimum: 1, maximum: 3 },
  },
  required: ["tile", "tsumogiri", "playerIndex"],
};

const playerState = {
  type: "object",
  description: "玩家状态。自家可包含 hand，对手通常不包含 hand。",
  additionalProperties: false,
  properties: {
    seatWind: windTile,
    points: { type: "integer" },
    hand: { type: "array", items: tileId },
    calls: { type: "array", items: call },
    discards: { type: "array", items: discard },
    riichi: { type: "boolean" },
    ippatsu: { type: "boolean" },
    menzen: { type: "boolean" },
  },
  required: ["seatWind", "points", "calls", "discards", "riichi", "ippatsu", "menzen"],
};

const gameState = {
  type: "object",
  description: "完整当前局面状态，用于推荐当前合法动作。",
  additionalProperties: false,
  properties: {
    phase: {
      type: "string",
      enum: ["self_draw", "opponent_discard", "chankan", "rinshan_draw", "after_call_discard"],
    },
    forbiddenDiscards: { type: "array", items: tileId },
    temporaryFuriten: { type: "boolean" },
    riichiFuriten: { type: "boolean" },
    round: {
      type: "object",
      additionalProperties: false,
      properties: {
        bakaze: windTile,
        kyoku: { type: "integer", minimum: 1, maximum: 4 },
        honba: { type: "integer", minimum: 0 },
        riichiSticks: { type: "integer", minimum: 0 },
        turn: { type: "integer", minimum: 0 },
      },
      required: ["bakaze", "kyoku", "honba", "riichiSticks", "turn"],
    },
    self: playerState,
    opponents: { type: "array", items: playerState, minItems: 3, maxItems: 3 },
    doraIndicators: { type: "array", items: tileId },
    visibleTiles: counts34,
    lastDraw: tileId,
    lastDiscard: discardEvent,
    lastKan: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["minkan", "ankan", "kakan"] },
        tile: tileId,
        playerIndex: { type: "integer", minimum: 0, maximum: 3 },
      },
      required: ["type", "tile", "playerIndex"],
    },
    rules: ruleConfig,
  },
  required: ["round", "self", "opponents", "doraIndicators", "visibleTiles", "rules"],
};

const analyzeHandRequest = {
  type: "object",
  description: "手牌牌理分析请求。根据张数返回进张分析或切牌候选。",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, description: "手牌文本，例如 3456m3455p123788s。也可包含“手牌:”标签。" },
    mode: { type: "integer", enum: [0, 1], description: "向听模式。0 表示一般形/七对子/国士综合，1 表示只计算一般形。" },
    unavailableTiles: { type: "array", items: tileId, description: "额外不可用牌列表，用于扣除剩余枚数。" },
    verbose: { type: "boolean", description: "是否返回底层调试字段。" },
  },
  required: ["text"],
};

const nanikiruRequest = {
  type: "object",
  description: "何切推荐请求。输入 3n+2 手牌文本，并可提供场况上下文。",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, description: "需要切一张的手牌文本，例如 3456m3455p123788s。" },
    mode: { type: "integer", enum: [0, 1], description: "向听模式。通常门清手用 0，副露手用 1。" },
    policy: nanikiruPolicy,
    context: {
      type: "object",
      description: "可选场况上下文，例如副露、自风、场风、巡目、宝牌和对手状态。",
      additionalProperties: false,
      properties: {
        calls: { type: "array", items: call, description: "自家副露列表。没有副露时省略或传空数组。" },
        seatWind: { ...windTile, description: "自风：1z 东，2z 南，3z 西，4z 北。" },
        bakaze: { ...windTile, description: "场风：1z 东，2z 南，3z 西，4z 北。" },
        kyoku: { type: "integer", minimum: 1, maximum: 4, description: "当前局数，1-4。" },
        points: { type: "integer", description: "自家当前点数。" },
        opponents: {
          type: "array",
          description: "对手简化状态。可用于防守判断；没有明确信息时可省略。",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              seatWind: { ...windTile, description: "对手自风。" },
              points: { type: "integer", description: "对手点数。" },
              calls: { type: "array", items: call, description: "对手副露。" },
              discards: { type: "array", items: discard, description: "对手弃牌河。" },
              riichi: { type: "boolean", description: "对手是否立直。" },
              ippatsu: { type: "boolean", description: "对手是否仍处于一发巡。" },
              menzen: { type: "boolean", description: "对手是否门前清。" },
            },
          },
        },
        honba: { type: "integer", minimum: 0, description: "本场数。" },
        turn: { type: "integer", minimum: 0, description: "当前巡目。用于早中晚巡、立直和防守判断。" },
        riichiSticks: { type: "integer", minimum: 0, description: "场上供托立直棒数量。" },
        doraIndicators: { type: "array", items: tileId, description: "宝牌指示牌列表。" },
        uraDoraIndicators: { type: "array", items: tileId, description: "里宝牌指示牌列表。通常只有立直和牌计分时需要。" },
        akaDoraCount: { type: "integer", minimum: 0, description: "额外赤宝牌数量。手牌文本中的 0m/0p/0s 会自动计入，通常不用手动传。" },
        rules: { ...ruleConfig, description: "规则配置。通常省略，使用默认现代日麻规则。" },
      },
    },
    options: {
      type: "object",
      description: "输出和策略运行选项。",
      additionalProperties: false,
      properties: {
        includeCandidates: { type: "boolean", description: "是否返回完整切牌候选列表。默认 false，只返回推荐候选。" },
        includeRaw: { type: "boolean", description: "是否返回底层牌理原始结果。默认 false。" },
        verbose: { type: "boolean", description: "是否返回调试级详细输出。默认 false。" },
        useEvDecision: { type: "boolean", description: "是否启用 EV 二次仲裁。默认 true；只想看基础策略时可设为 false。" },
      },
    },
  },
  required: ["text"],
};

const scoreHandRequest = {
  type: "object",
  description: "和牌计分请求。输入闭合手牌、和牌牌、和牌方式和可选上下文。",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, description: "闭合手牌文本，不包含副露牌。例：123m456m789p234s22z。" },
    winningTile: { ...tileId, description: "和牌牌。" },
    method: { type: "string", enum: ["ron", "tsumo"], description: "和牌方式：ron 荣和，tsumo 自摸。" },
    calls: { type: "array", items: call },
    seatWind: windTile,
    bakaze: windTile,
    rules: ruleConfig,
    riichi: { type: "boolean" },
    doubleRiichi: { type: "boolean" },
    ippatsu: { type: "boolean" },
    rinshan: { type: "boolean" },
    chankan: { type: "boolean" },
    haitei: { type: "boolean" },
    houtei: { type: "boolean" },
    tenhou: { type: "boolean" },
    chiihou: { type: "boolean" },
    honba: { type: "integer", minimum: 0 },
    riichiSticks: { type: "integer", minimum: 0 },
    doraIndicators: { type: "array", items: tileId },
    uraDoraIndicators: { type: "array", items: tileId },
    akaDoraCount: { type: "integer", minimum: 0 },
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        verbose: { type: "boolean" },
        includeCandidates: { type: "boolean" },
        includeDecompositions: { type: "boolean" },
        includeRaw: { type: "boolean" },
      },
    },
  },
  required: ["text", "winningTile", "method"],
};

const chooseActionRequest = {
  type: "object",
  description: "完整 GameState 当前动作推荐请求。",
  additionalProperties: false,
  properties: {
    state: gameState,
    policy: nanikiruPolicy,
    options: {
      type: "object",
      description: "输出和策略运行选项。",
      additionalProperties: false,
      properties: {
        useEvDecision: { type: "boolean" },
        includeCandidates: { type: "boolean" },
        includeAnalysis: { type: "boolean" },
        includeEstimate: { type: "boolean" },
      },
    },
  },
  required: ["state"],
};

const nanikiruToolRequest = omitSchemaProperties(nanikiruRequest, ["policy"]);
const chooseActionToolRequest = omitSchemaProperties(chooseActionRequest, ["policy"]);

const discardAction = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { const: "discard" },
    tile: tileId,
  },
  required: ["type", "tile"],
};

const riichiDiscardAction = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { const: "riichi-discard" },
    tile: tileId,
  },
  required: ["type", "tile"],
};

const callDiscardAction = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { const: "call-discard" },
    callType: { type: "string", enum: ["chi", "pon", "minkan"] },
    calledTile: tileId,
    tile: tileId,
  },
  required: ["type", "callType", "calledTile", "tile"],
};

const minkanAction = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { const: "minkan" },
    tiles: { type: "array", items: tileId, minItems: 4, maxItems: 4 },
    calledTile: tileId,
  },
  required: ["type", "tiles", "calledTile"],
};

const closedKanAction = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["ankan", "kakan"] },
    tiles: { type: "array", items: tileId, minItems: 4, maxItems: 4 },
  },
  required: ["type", "tiles"],
};

const candidateAction = {
  oneOf: [
    discardAction,
    riichiDiscardAction,
    callDiscardAction,
    minkanAction,
    closedKanAction,
  ],
};

const decisionAction = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "discard" },
        tile: tileId,
      },
      required: ["type", "tile"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "riichi" },
        tile: tileId,
      },
      required: ["type", "tile"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["tsumo", "ron", "pass"] },
      },
      required: ["type"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["chi", "pon", "minkan"] },
        tiles: { type: "array", items: tileId, minItems: 3, maxItems: 4 },
        calledTile: tileId,
        discard: tileId,
      },
      required: ["type", "tiles", "calledTile"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["ankan", "kakan"] },
        tiles: { type: "array", items: tileId, minItems: 4, maxItems: 4 },
        discard: tileId,
      },
      required: ["type", "tiles"],
    },
  ],
};

const reason = {
  type: "object",
  additionalProperties: true,
  properties: {
    type: { type: "string" },
    polarity: { type: "string", enum: ["positive", "negative", "neutral"] },
    priority: { type: "number" },
    message: { type: "string" },
    data: { type: "object", additionalProperties: true },
  },
  required: ["type", "polarity", "priority", "message"],
};

const tileInfo = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: tileId,
    remaining: { type: "integer", minimum: 0, maximum: 4 },
  },
  required: ["id", "remaining"],
};

const scoreBreakdown = {
  type: "object",
  additionalProperties: { type: "number" },
};

const nanikiruCandidate = {
  type: "object",
  additionalProperties: true,
  properties: {
    discard: tileId,
    shanten: { type: "integer" },
    waits: { type: "array", items: tileInfo },
    totalWaits: { type: "integer", minimum: 0 },
    goodShapeCount: { type: "integer", minimum: 0 },
    goodShapeDraws: { type: "array", items: tileId },
    score: { type: "number" },
    scoreBreakdown,
    reasons: { type: "array", items: reason },
  },
  required: ["discard", "shanten", "waits", "totalWaits", "goodShapeCount", "goodShapeDraws", "score", "scoreBreakdown", "reasons"],
};

const nanikiruResponseData = {
  type: "object",
  additionalProperties: true,
  properties: {
    input: { type: "string" },
    handText: { type: "string" },
    hand: { type: "array", items: tileId },
    tileCount: { type: "integer", minimum: 0 },
    shanten: { type: "integer" },
    isTenpai: { type: "boolean" },
    isAgari: { type: "boolean" },
    recommendation: tileId,
    recommendedCandidate: nanikiruCandidate,
    candidates: { type: "array", items: nanikiruCandidate },
    explanation: { type: "string" },
  },
  required: ["input", "handText", "hand", "tileCount", "shanten", "isTenpai", "isAgari", "explanation"],
};

const chooseActionResponseData = {
  type: "object",
  additionalProperties: true,
  properties: {
    phase: { type: "string", enum: ["self_draw", "opponent_discard", "chankan", "rinshan_draw", "after_call_discard", "unknown"] },
    mode: { type: "string", enum: ["attack", "balance", "defense", "push"] },
    action: decisionAction,
    explanation: { type: "string" },
    recommendedCandidate: nanikiruCandidate,
    candidates: { type: "array" },
    analysis: { type: "object" },
  },
  required: ["phase", "mode", "explanation"],
};

const scoreHandResponseData = {
  type: "object",
  additionalProperties: true,
  properties: {
    input: { type: "string" },
    handText: { type: "string" },
    hand: { type: "array", items: tileId },
    winningTile: tileId,
    method: { type: "string", enum: ["ron", "tsumo"] },
    status: { type: "string", enum: ["not_agari", "invalid_context", "no_yaku", "scored"] },
    warnings: { type: "array" },
    best: { type: "object" },
    candidates: { type: "array" },
  },
  required: ["input", "handText", "hand", "winningTile", "method", "status", "warnings"],
};

const estimateRequest = {
  type: "object",
  description: "局收支快速估算请求。可以估算指定动作，也可以估算当前切牌候选。",
  additionalProperties: false,
  properties: {
    state: gameState,
    action: { ...candidateAction, description: "可选指定动作。不传时估算当前所有切牌候选。" },
    mode: { type: "string", enum: ["fast", "balanced", "deep"], description: "估算模式。当前主要实现 fast 启发式估算。" },
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        includeCandidates: { type: "boolean" },
      },
    },
  },
  required: ["state"],
};

const parseScreenshotRequest = {
  type: "object",
  description: "截图解析请求。当前版本尚未实现，会返回 not_implemented。",
  additionalProperties: false,
  properties: {
    imageBase64: { type: "string" },
    imageUrl: { type: "string" },
    layoutHint: { type: "string", enum: ["majsoul", "tenhou", "mortal", "unknown"] },
  },
};

const serviceWarning = {
  type: "object",
  additionalProperties: true,
  properties: {
    code: { type: "string" },
    message: { type: "string" },
    details: {},
  },
  required: ["code", "message"],
};

const serviceError = {
  type: "object",
  additionalProperties: true,
  properties: {
    code: {
      type: "string",
      enum: [
        "invalid_input",
        "invalid_tile",
        "invalid_hand",
        "invalid_state",
        "invalid_context",
        "unsupported",
        "not_implemented",
        "internal_error",
      ],
    },
    message: { type: "string" },
    details: {},
    retryable: { type: "boolean" },
  },
  required: ["code", "message", "retryable"],
};

const serviceMeta = {
  type: "object",
  additionalProperties: false,
  properties: {
    apiVersion: { type: "string" },
    engineVersion: { type: "string" },
    elapsedMs: { type: "integer", minimum: 0 },
    source: { type: "string", enum: ["library", "cli", "http", "mcp", "openai_tool", "anthropic_tool"] },
    requestId: { type: "string" },
  },
  required: ["apiVersion", "engineVersion", "elapsedMs", "source"],
};

const serviceSuccess = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { const: true },
    data: {},
    warnings: { type: "array", items: serviceWarning },
    meta: serviceMeta,
  },
  required: ["ok", "data", "warnings", "meta"],
};

const serviceFailure = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { const: false },
    error: serviceError,
    warnings: { type: "array", items: serviceWarning },
    meta: serviceMeta,
  },
  required: ["ok", "error", "warnings", "meta"],
};

const serviceResult = {
  type: "object",
  oneOf: [serviceSuccess, serviceFailure],
};

const toolOutputServiceResult = {
  type: "object",
  description: "统一工具输出。ok 为 true 时 data 包含业务结果；ok 为 false 时 error 包含稳定错误码和说明。",
  oneOf: [serviceSuccess, serviceFailure],
};

export const schemas = {
  tileId,
  windTile,
  counts34,
  ruleConfig,
  nanikiruPolicy,
  call,
  discard,
  candidateAction,
  decisionAction,
  reason,
  tileInfo,
  scoreBreakdown,
  nanikiruCandidate,
  nanikiruResponseData,
  chooseActionResponseData,
  scoreHandResponseData,
  gameState,
  analyzeHandRequest,
  nanikiruRequest,
  nanikiruToolRequest,
  scoreHandRequest,
  chooseActionRequest,
  chooseActionToolRequest,
  estimateRequest,
  parseScreenshotRequest,
  serviceWarning,
  serviceError,
  serviceMeta,
  serviceSuccess,
  serviceFailure,
  serviceResult,
  toolOutputServiceResult,
} satisfies Record<string, JsonSchema>;

export type SchemaName = keyof typeof schemas;

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<SchemaName, ValidateFunction>();

export function getValidator(name: SchemaName): ValidateFunction {
  const cached = validators.get(name);
  if (cached) {
    return cached;
  }
  const validate = ajv.compile(schemas[name]);
  validators.set(name, validate);
  return validate;
}

export function validateSchema(name: SchemaName, input: unknown): {
  valid: true;
} | {
  valid: false;
  errors: string[];
} {
  const validate = getValidator(name);
  if (validate(input)) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: (validate.errors ?? []).map((error) => {
      const path = error.instancePath || "/";
      return `${path} ${error.message ?? "is invalid"}`;
    }),
  };
}

function omitSchemaProperties(schema: JsonSchema, propertyNames: readonly string[]): JsonSchema {
  const sourceProperties = schema.properties;
  if (!sourceProperties || typeof sourceProperties !== "object" || Array.isArray(sourceProperties)) {
    return schema;
  }

  const properties = { ...(sourceProperties as Record<string, unknown>) };
  for (const propertyName of propertyNames) {
    delete properties[propertyName];
  }

  const result: JsonSchema = {
    ...schema,
    properties,
  };
  if (Array.isArray(schema.required)) {
    result.required = schema.required.filter((field) => (
      typeof field !== "string" || !propertyNames.includes(field)
    ));
  }
  return result;
}
