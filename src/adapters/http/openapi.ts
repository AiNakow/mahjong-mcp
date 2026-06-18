import { ADAPTER_API_VERSION, ENGINE_VERSION } from "../../service/responses.ts";
import { schemas } from "../../schemas/registry.ts";

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Mahjong AI Agent Adapter API",
      version: ENGINE_VERSION,
    },
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": {
              description: "Service health",
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI document",
          responses: {
            "200": {
              description: "OpenAPI document",
            },
          },
        },
      },
      "/v1/mahjong/analyze-hand": postOperation("Analyze hand", schemas.analyzeHandRequest),
      "/v1/mahjong/nanikiru": postOperation("Recommend discard from hand text", schemas.nanikiruRequest),
      "/v1/mahjong/score-hand": postOperation("Score a winning hand", schemas.scoreHandRequest),
      "/v1/mahjong/choose-action": postOperation("Choose action from GameState", schemas.chooseActionRequest),
      "/v1/mahjong/estimate": postOperation("Estimate round income", schemas.estimateRequest),
      "/v1/mahjong/parse-screenshot": postOperation("Parse screenshot into GameState", schemas.parseScreenshotRequest),
    },
    components: {
      schemas: {
        AnalyzeHandRequest: schemas.analyzeHandRequest,
        NanikiruRequest: schemas.nanikiruRequest,
        ScoreHandRequest: schemas.scoreHandRequest,
        ChooseActionRequest: schemas.chooseActionRequest,
        EstimateRequest: schemas.estimateRequest,
        ParseScreenshotRequest: schemas.parseScreenshotRequest,
        GameState: schemas.gameState,
        DecisionAction: schemas.decisionAction,
        Reason: schemas.reason,
        NanikiruCandidate: schemas.nanikiruCandidate,
        NanikiruResponseData: schemas.nanikiruResponseData,
        ChooseActionResponseData: schemas.chooseActionResponseData,
        ScoreHandResponseData: schemas.scoreHandResponseData,
        ServiceResult: schemas.serviceResult,
        ServiceFailure: schemas.serviceFailure,
      },
    },
    "x-mahjong-ai-api-version": ADAPTER_API_VERSION,
  };
}

function postOperation(summary: string, schema: Record<string, unknown>) {
  return {
    post: {
      summary,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema,
          },
        },
      },
      responses: {
        "200": {
          description: "ServiceResult success",
          content: {
            "application/json": {
              schema: schemas.serviceResult,
            },
          },
        },
        "400": {
          description: "Invalid request",
          content: {
            "application/json": {
              schema: schemas.serviceFailure,
            },
          },
        },
        "422": {
          description: "Invalid mahjong context",
          content: {
            "application/json": {
              schema: schemas.serviceFailure,
            },
          },
        },
        "500": {
          description: "Internal error",
          content: {
            "application/json": {
              schema: schemas.serviceFailure,
            },
          },
        },
      },
    },
  };
}
