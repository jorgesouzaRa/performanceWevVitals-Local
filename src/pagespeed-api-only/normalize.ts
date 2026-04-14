import type {
  CategoryScoreNorm,
  CollectionStatus,
  FieldDataBlock,
  FieldMetricNorm,
  MetricNorm,
  MetricUnit,
  NormalizedAudit,
  PagespeedApiRawResponse,
  ProfileNorm,
  ProfileStrategy,
  ScreenshotInfo,
} from "./types.js";
import type { RunPagespeedResult } from "./client.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const METRIC_AUDIT_MAP: { id: string; key: string; unit: MetricUnit }[] = [
  { id: "first-contentful-paint", key: "fcp", unit: "ms" },
  { id: "largest-contentful-paint", key: "lcp", unit: "ms" },
  { id: "speed-index", key: "speedIndex", unit: "ms" },
  { id: "total-blocking-time", key: "tbt", unit: "ms" },
  { id: "cumulative-layout-shift", key: "cls", unit: "unitless" },
  { id: "interactive", key: "tti", unit: "ms" },
  { id: "experimental-interaction-to-next-paint", key: "inp", unit: "ms" },
];

function normalizeAudit(audit: Record<string, unknown>): NormalizedAudit {
  const id = str(audit.id) ?? "unknown";
  const title = str(audit.title);
  const description = str(audit.description);
  const warnings = Array.isArray(audit.warnings)
    ? audit.warnings.map((w) => String(w))
    : null;
  let explanationSnippet: string | null = null;
  if (description) {
    const one = description.replace(/\s+/g, " ").trim();
    explanationSnippet = one.length > 220 ? `${one.slice(0, 217)}…` : one;
  }
  return {
    id,
    title,
    description,
    score: num(audit.score),
    scoreDisplayMode: str(audit.scoreDisplayMode),
    displayValue: str(audit.displayValue),
    numericValue: num(audit.numericValue),
    details: audit.details ?? null,
    warnings,
    explanationSnippet,
  };
}

function pickScreenshots(
  audits: Record<string, Record<string, unknown>> | undefined
): ScreenshotInfo {
  const fullDetails = asRecord(audits?.["final-screenshot"]?.details);
  const thumbBlock = audits?.["screenshot-thumbnails"];
  let fullPageDataUrl: string | null = null;
  let thumbnailDataUrl: string | null = null;
  const sourceAuditIds: string[] = [];
  if (fullDetails && typeof fullDetails.data === "string") {
    fullPageDataUrl = fullDetails.data;
    sourceAuditIds.push("final-screenshot");
  }
  if (thumbBlock) {
    const d = asRecord(thumbBlock.details);
    const items = d?.items;
    if (Array.isArray(items) && items[0] && typeof items[0] === "object") {
      const first = items[0] as Record<string, unknown>;
      if (typeof first.data === "string") {
        thumbnailDataUrl = first.data;
        sourceAuditIds.push("screenshot-thumbnails");
      }
    }
  }
  return { fullPageDataUrl, thumbnailDataUrl, sourceAuditIds };
}

function buildFieldData(json: PagespeedApiRawResponse): FieldDataBlock {
  const le = json.loadingExperience as Record<string, unknown> | undefined;
  const ole = json.originLoadingExperience as Record<string, unknown> | undefined;
  const urlMetrics =
    le?.metrics && typeof le.metrics === "object"
      ? (le.metrics as Record<string, unknown>)
      : null;
  const originMetrics =
    ole?.metrics && typeof ole.metrics === "object"
      ? (ole.metrics as Record<string, unknown>)
      : null;
  const useUrl = urlMetrics && Object.keys(urlMetrics).length > 0;
  const useOrigin = originMetrics && Object.keys(originMetrics).length > 0;
  const scope: "url" | "origin" | null = useUrl ? "url" : useOrigin ? "origin" : null;
  const metricsSrc = useUrl ? urlMetrics! : useOrigin ? originMetrics! : {};
  const metricsNormalized: FieldMetricNorm[] = [];
  for (const [metricId, raw] of Object.entries(metricsSrc)) {
    const m = asRecord(raw);
    const percentile = num(m?.percentile);
    const category = str(m?.category);
    const distributions = m?.distributions;
    metricsNormalized.push({
      metricId,
      percentile,
      category,
      distributions,
    });
  }
  const notes: string[] = [];
  if (!scope) {
    notes.push("Sem dados de campo (CrUX) para URL nem origem nesta resposta.");
  } else if (scope === "origin") {
    notes.push(
      "Dados de campo ao nível da origem (agregado), não da página específica."
    );
  }
  return {
    available: scope !== null,
    scope,
    loadingExperience: le ? (le as Record<string, unknown>) : null,
    originLoadingExperience: ole ? (ole as Record<string, unknown>) : null,
    metricsNormalized,
    notes,
  };
}

const CORE_METRIC_IDS = new Set(METRIC_AUDIT_MAP.map((m) => m.id));

function splitOpportunitiesDiagnostics(
  lighthouseResult: Record<string, unknown>
): { opportunities: NormalizedAudit[]; diagnostics: NormalizedAudit[] } {
  const audits = lighthouseResult.audits as
    | Record<string, Record<string, unknown>>
    | undefined;
  const categories = lighthouseResult.categories as
    | Record<string, Record<string, unknown>>
    | undefined;
  const perf = categories?.performance;
  const refs = perf?.auditRefs as
    | { id: string; group?: string }[]
    | undefined;
  const oppIds = new Set<string>();
  const diagIds = new Set<string>();
  if (refs) {
    for (const r of refs) {
      if (r.group === "load-opportunities" || r.group === "budgets") {
        oppIds.add(r.id);
      }
      if (r.group === "diagnostics") {
        diagIds.add(r.id);
      }
    }
  }
  const opportunities: NormalizedAudit[] = [];
  const diagnostics: NormalizedAudit[] = [];
  if (!audits) return { opportunities, diagnostics };

  for (const [id, raw] of Object.entries(audits)) {
    const a = raw as Record<string, unknown>;
    const na = normalizeAudit(a);
    const details = asRecord(a.details);
    const isOpp =
      oppIds.has(id) ||
      details?.type === "opportunity" ||
      str(a.scoreDisplayMode) === "metricSavings";
    if (isOpp) {
      opportunities.push(na);
      continue;
    }
    if (CORE_METRIC_IDS.has(id) || id === "final-screenshot" || id === "screenshot-thumbnails") {
      continue;
    }
    if (diagIds.has(id)) {
      diagnostics.push(na);
    }
  }
  return { opportunities, diagnostics };
}

function extractMetrics(
  audits: Record<string, Record<string, unknown>> | undefined
): Record<string, MetricNorm> {
  const out: Record<string, MetricNorm> = {};
  if (!audits) return out;
  for (const m of METRIC_AUDIT_MAP) {
    const a = audits[m.id];
    if (!a) continue;
    const numericValue = num(a.numericValue);
    const displayValue = str(a.displayValue);
    out[m.key] = {
      key: m.key,
      auditId: m.id,
      numericValue,
      displayValue,
      unit: m.unit,
      score01: num(a.score),
      provenance: "api",
    };
  }
  return out;
}

function extractCategories(lighthouseResult: Record<string, unknown>): CategoryScoreNorm[] {
  const cats = lighthouseResult.categories as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!cats) return [];
  const order = ["performance", "accessibility", "best-practices", "seo"];
  const list: CategoryScoreNorm[] = [];
  const keys = new Set([...order, ...Object.keys(cats)]);
  for (const id of keys) {
    const c = cats[id];
    if (!c) continue;
    const score01 = num(c.score);
    const title = str(c.title);
    list.push({
      id,
      title,
      score01,
      score100: score01 !== null ? Math.round(score01 * 100) : null,
      status: "api",
      manualDescription: str(c.manualDescription),
    });
  }
  return list;
}

export function normalizeProfileFromResult(
  result: RunPagespeedResult,
  strategy: ProfileStrategy,
  rawPayloadPath?: string
): ProfileNorm {
  if (!result.ok) {
    return emptyProfile(strategy, {
      kind: "error",
      message: result.message,
      httpStatus: result.status,
      apiErrorCode: result.apiError?.code,
      errorKind: result.errorKind,
    }, rawPayloadPath);
  }
  return normalizeProfileFromApiJson(result.json, strategy, rawPayloadPath);
}

export function normalizeProfileFromApiJson(
  json: PagespeedApiRawResponse,
  strategy: ProfileStrategy,
  rawPayloadPath?: string
): ProfileNorm {
  const lh = json.lighthouseResult as Record<string, unknown> | undefined;
  if (!lh) {
    const err = json.error as { code?: number; message?: string } | undefined;
    const st: CollectionStatus = {
      kind: "error",
      message: err?.message ?? "lighthouseResult ausente",
      apiErrorCode: err?.code,
      errorKind: "invalid_response",
    };
    return emptyProfile(strategy, st, rawPayloadPath);
  }

  const audits = lh.audits as Record<string, Record<string, unknown>> | undefined;
  const auditsAll: NormalizedAudit[] = audits
    ? Object.values(audits).map((a) => normalizeAudit(a as Record<string, unknown>))
    : [];
  const { opportunities, diagnostics } = splitOpportunitiesDiagnostics(lh);
  const metrics = extractMetrics(audits);
  const categories = extractCategories(lh);
  const fieldData = buildFieldData(json);
  const screenshots = pickScreenshots(audits);
  const runtimeError = lh.runtimeError as { message?: string } | undefined;
  const runWarnings = Array.isArray(lh.runWarnings)
    ? lh.runWarnings.map((w) => String(w))
    : null;
  const stackPacks = Array.isArray(lh.stackPacks) ? lh.stackPacks : null;
  const entities = lh.entities ?? null;

  const st: CollectionStatus = runtimeError?.message
    ? {
        kind: "partial",
        message: runtimeError.message,
      }
    : { kind: "ok" };

  return {
    strategy,
    source: "pagespeed_insights_api_v5",
    status: st,
    meta: {
      finalUrl: str(lh.finalUrl),
      requestedUrl: str(lh.requestedUrl),
      lighthouseVersion: str(lh.lighthouseVersion),
      fetchTime: str(lh.fetchTime),
      userAgent: str(lh.userAgent),
      environment: asRecord(lh.environment),
      runtimeError: runtimeError?.message
        ? { message: runtimeError.message }
        : null,
      analysisTimestamp: str(json.analysisUTCTimestamp) ?? str(lh.fetchTime),
    },
    categories,
    metrics,
    fieldData,
    auditsAll,
    opportunities: sortAuditsByImpact(opportunities),
    diagnostics: sortAuditsByImpact(diagnostics),
    screenshots,
    stackPacks,
    entities,
    runWarnings,
    rawPayloadPath,
  };
}

function sortAuditsByImpact(audits: NormalizedAudit[]): NormalizedAudit[] {
  return [...audits].sort((a, b) => {
    const na = a.numericValue;
    const nb = b.numericValue;
    if (na != null && nb != null) return nb - na;
    if (na != null) return -1;
    if (nb != null) return 1;
    return 0;
  });
}

function emptyProfile(
  strategy: ProfileStrategy,
  status: CollectionStatus,
  rawPayloadPath?: string
): ProfileNorm {
  return {
    strategy,
    source: "pagespeed_insights_api_v5",
    status,
    meta: {
      finalUrl: null,
      requestedUrl: null,
      lighthouseVersion: null,
      fetchTime: null,
      userAgent: null,
      environment: null,
      runtimeError: null,
      analysisTimestamp: null,
    },
    categories: [],
    metrics: {},
    fieldData: {
      available: false,
      scope: null,
      loadingExperience: null,
      originLoadingExperience: null,
      metricsNormalized: [],
      notes: ["Dados de campo indisponíveis (erro de coleta ou payload incompleto)."],
    },
    auditsAll: [],
    opportunities: [],
    diagnostics: [],
    screenshots: {
      fullPageDataUrl: null,
      thumbnailDataUrl: null,
      sourceAuditIds: [],
    },
    stackPacks: null,
    entities: null,
    runWarnings: null,
    rawPayloadPath,
  };
}

