import { analyzeHandText } from "./analyze.ts";
import { analyzeNanikiru as analyzeNanikiruService } from "./nanikiru.ts";
import { scoreHand } from "./score-hand.ts";
import { estimateDiscardActions } from "./estimate.ts";
import { chooseAction } from "../strategy/choose-action.ts";
import { estimateRound } from "../ev/index.ts";
import { MahjongServiceError, toServiceError, type ServiceWarning } from "./errors.ts";
import {
  ADAPTER_API_VERSION,
  ENGINE_VERSION,
  type ServiceMeta,
  type ServiceResult,
} from "./responses.ts";
import {
  type AdapterRequestOptions,
  type AnalyzeHandRequest,
  type ChooseActionRequest,
  type EstimateRequest,
  type NanikiruRequest,
  type ParseScreenshotRequest,
  type ScoreHandRequest,
} from "./requests.ts";
import { validateSchema, type SchemaName } from "../schemas/registry.ts";

export function analyzeHandRequest(
  request: AnalyzeHandRequest,
  options: AdapterRequestOptions = {},
): ServiceResult<ReturnType<typeof analyzeHandText>> {
  return runService("analyzeHandRequest", "analyzeHandRequest", request, options, () => analyzeHandText(request));
}

export function analyzeNanikiruRequest(
  request: NanikiruRequest,
  options: AdapterRequestOptions = {},
): ServiceResult<ReturnType<typeof analyzeNanikiruService>> {
  return runService("nanikiruRequest", "nanikiruRequest", request, options, () => analyzeNanikiruService({
    text: request.text,
    mode: request.mode,
    policy: request.policy,
    includeCandidates: request.options?.includeCandidates,
    includeRaw: request.options?.includeRaw,
    verbose: request.options?.verbose,
    useEvDecision: request.options?.useEvDecision,
    calls: request.context?.calls,
    seatWind: request.context?.seatWind,
    bakaze: request.context?.bakaze,
    kyoku: request.context?.kyoku,
    points: request.context?.points,
    opponents: request.context?.opponents,
    honba: request.context?.honba,
    turn: request.context?.turn,
    riichiSticks: request.context?.riichiSticks,
    doraIndicators: request.context?.doraIndicators,
    uraDoraIndicators: request.context?.uraDoraIndicators,
    akaDoraCount: request.context?.akaDoraCount,
    rules: request.context?.rules,
  }));
}

export function scoreHandRequest(
  request: ScoreHandRequest,
  options: AdapterRequestOptions = {},
): ServiceResult<ReturnType<typeof scoreHand>> {
  return runService("scoreHandRequest", "scoreHandRequest", request, options, () => scoreHand({
    text: request.text,
    winningTile: request.winningTile,
    method: request.method,
    calls: request.calls,
    seatWind: request.seatWind,
    bakaze: request.bakaze,
    rules: request.rules,
    riichi: request.riichi,
    doubleRiichi: request.doubleRiichi,
    ippatsu: request.ippatsu,
    rinshan: request.rinshan,
    chankan: request.chankan,
    haitei: request.haitei,
    houtei: request.houtei,
    tenhou: request.tenhou,
    chiihou: request.chiihou,
    honba: request.honba,
    riichiSticks: request.riichiSticks,
    doraIndicators: request.doraIndicators,
    uraDoraIndicators: request.uraDoraIndicators,
    akaDoraCount: request.akaDoraCount,
    verbose: request.options?.verbose,
    includeCandidates: request.options?.includeCandidates,
    includeDecompositions: request.options?.includeDecompositions,
    includeRaw: request.options?.includeRaw,
  }));
}

export interface ChooseActionFacadeResponse {
  phase: ReturnType<typeof chooseAction>["phase"];
  mode: ReturnType<typeof chooseAction>["mode"];
  action: ReturnType<typeof chooseAction>["action"];
  explanation: string;
  recommendedCandidate?: ReturnType<typeof chooseAction>["analysis"]["candidates"][number];
  riichiPlanDecision?: ReturnType<typeof chooseAction>["analysis"]["riichiPlanDecision"];
  estimate?: ReturnType<typeof chooseAction>["candidates"][number]["estimate"];
  candidates?: ReturnType<typeof chooseAction>["candidates"];
  analysis?: ReturnType<typeof chooseAction>["analysis"];
}

export function chooseActionRequest(
  request: ChooseActionRequest,
  options: AdapterRequestOptions = {},
): ServiceResult<ChooseActionFacadeResponse> {
  return runService("chooseActionRequest", "chooseActionRequest", request, options, () => {
    const decision = chooseAction(request.state, {
      policy: request.policy,
      useEvDecision: request.options?.useEvDecision,
    });
    const selected = decision.candidates.find((candidate) => candidate.action === decision.action)
      ?? decision.candidates[0];
    return {
      phase: decision.phase,
      mode: decision.mode,
      action: decision.action,
      explanation: decision.explanation,
      recommendedCandidate: decision.analysis.candidates[0],
      riichiPlanDecision: decision.analysis.riichiPlanDecision,
      estimate: request.options?.includeEstimate ? selected?.estimate : undefined,
      candidates: request.options?.includeCandidates ? decision.candidates : undefined,
      analysis: request.options?.includeAnalysis ? decision.analysis : undefined,
    };
  });
}

export type EstimateFacadeResponse =
  | ReturnType<typeof estimateDiscardActions>
  | ReturnType<typeof estimateRound>;

export function estimateRequest(
  request: EstimateRequest,
  options: AdapterRequestOptions = {},
): ServiceResult<EstimateFacadeResponse> {
  return runService("estimateRequest", "estimateRequest", request, options, () => {
    if (request.action) {
      return estimateRound({
        state: request.state,
        action: request.action,
        mode: request.mode,
      });
    }
    return estimateDiscardActions({
      state: request.state,
      mode: request.mode,
      includeCandidates: request.options?.includeCandidates,
    });
  });
}

export function parseScreenshotRequest(
  request: ParseScreenshotRequest,
  options: AdapterRequestOptions = {},
): ServiceResult<never> {
  return runService("parseScreenshotRequest", "parseScreenshotRequest", request, options, () => {
    throw new MahjongServiceError("not_implemented", "截图识别尚未实现。");
  });
}

function runService<T>(
  schemaName: SchemaName,
  _operation: string,
  request: unknown,
  options: AdapterRequestOptions,
  fn: () => T,
): ServiceResult<T> {
  const started = Date.now();
  const warnings: ServiceWarning[] = [];
  try {
    const validation = validateSchema(schemaName, request);
    if (!validation.valid) {
      throw new MahjongServiceError("invalid_input", "请求结构不符合接口 schema。", {
        details: validation.errors,
      });
    }
    const data = fn();
    return {
      ok: true,
      data,
      warnings,
      meta: createMeta(started, options),
    };
  } catch (error) {
    return {
      ok: false,
      error: toServiceError(error),
      warnings,
      meta: createMeta(started, options),
    };
  }
}

function createMeta(started: number, options: AdapterRequestOptions): ServiceMeta {
  return {
    apiVersion: ADAPTER_API_VERSION,
    engineVersion: ENGINE_VERSION,
    elapsedMs: Date.now() - started,
    source: options.source ?? "library",
    requestId: options.requestId,
  };
}

