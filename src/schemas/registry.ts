import { Ajv, type ValidateFunction } from "ajv";

type JsonSchema = Record<string, unknown>;

const tileId = {
  type: "string",
  pattern: "^(?:[1-9][mps]|[1-7]z|0[mps])$",
};

const windTile = {
  type: "string",
  enum: ["1z", "2z", "3z", "4z"],
};

const counts34 = {
  type: "array",
  minItems: 34,
  maxItems: 34,
  items: { type: "integer", minimum: 0, maximum: 4 },
};

const ruleConfig = {
  type: "object",
  additionalProperties: false,
  properties: {
    akaDora: { type: "boolean" },
    kuitan: { type: "boolean" },
    doubleRon: { type: "boolean" },
    countDoubleYakuman: { type: "boolean" },
  },
  required: ["akaDora", "kuitan", "doubleRon", "countDoubleYakuman"],
};

const call = {
  type: "object",
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
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1 },
    mode: { type: "integer", enum: [0, 1] },
    unavailableTiles: { type: "array", items: tileId },
    verbose: { type: "boolean" },
  },
  required: ["text"],
};

const nanikiruRequest = {
  type: "object",
  additionalProperties: true,
  properties: {
    text: { type: "string", minLength: 1 },
    mode: { type: "integer", enum: [0, 1] },
    context: {
      type: "object",
      additionalProperties: true,
      properties: {
        calls: { type: "array", items: call },
        seatWind: windTile,
        bakaze: windTile,
        kyoku: { type: "integer", minimum: 1, maximum: 4 },
        points: { type: "integer" },
        honba: { type: "integer", minimum: 0 },
        turn: { type: "integer", minimum: 0 },
        riichiSticks: { type: "integer", minimum: 0 },
        doraIndicators: { type: "array", items: tileId },
        uraDoraIndicators: { type: "array", items: tileId },
        akaDoraCount: { type: "integer", minimum: 0 },
        rules: ruleConfig,
      },
    },
    policy: { type: "object", additionalProperties: true },
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        includeCandidates: { type: "boolean" },
        includeRaw: { type: "boolean" },
        verbose: { type: "boolean" },
        useEvDecision: { type: "boolean" },
      },
    },
  },
  required: ["text"],
};

const scoreHandRequest = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1 },
    winningTile: tileId,
    method: { type: "string", enum: ["ron", "tsumo"] },
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
  additionalProperties: false,
  properties: {
    state: gameState,
    policy: { type: "object", additionalProperties: true },
    options: {
      type: "object",
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

const estimateRequest = {
  type: "object",
  additionalProperties: false,
  properties: {
    state: gameState,
    action: candidateAction,
    mode: { type: "string", enum: ["fast", "balanced", "deep"] },
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
  oneOf: [serviceSuccess, serviceFailure],
};

export const schemas = {
  tileId,
  windTile,
  counts34,
  ruleConfig,
  call,
  discard,
  candidateAction,
  gameState,
  analyzeHandRequest,
  nanikiruRequest,
  scoreHandRequest,
  chooseActionRequest,
  estimateRequest,
  parseScreenshotRequest,
  serviceWarning,
  serviceError,
  serviceMeta,
  serviceSuccess,
  serviceFailure,
  serviceResult,
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
