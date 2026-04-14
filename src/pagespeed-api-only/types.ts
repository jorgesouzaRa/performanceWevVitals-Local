/**
 * Tipos do modo `pagespeed_api_only` — dados normalizados e metadados de proveniência.
 * Campos marcados como `derived` são calculados por regras internas, não enviados literalmente pela API.
 */

export type DataProvenance = "api" | "derived" | "absent" | "unavailable" | "error";

export type ProfileStrategy = "mobile" | "desktop";

export type CollectionStatusKind = "ok" | "error" | "partial";

export type CollectionStatus = {
  kind: CollectionStatusKind;
  /** Mensagem da API ou do cliente HTTP. */
  message?: string;
  httpStatus?: number;
  /** Código de erro Google quando existir. */
  apiErrorCode?: number;
  /** Timeout, rede, etc. */
  errorKind?:
    | "timeout"
    | "network"
    | "rate_limit"
    | "invalid_response"
    | "unknown"
    | "api_error";
};

export type CategoryScoreNorm = {
  id: string;
  title: string | null;
  /** Score Lighthouse 0–1 quando existir. */
  score01: number | null;
  /** Score 0–100 quando aplicável. */
  score100: number | null;
  status: DataProvenance;
  /** manual, informative, etc. quando existir em categories[id].manualDescription */
  manualDescription?: string | null;
};

export type MetricUnit = "ms" | "s" | "ratio" | "unitless" | "unknown";

export type MetricNorm = {
  key: string;
  auditId: string;
  numericValue: number | null;
  displayValue: string | null;
  unit: MetricUnit;
  /** Score do audit 0–1, se existir. */
  score01: number | null;
  provenance: DataProvenance;
};

export type FieldMetricNorm = {
  metricId: string;
  percentile: number | null;
  category: string | null;
  distributions?: unknown;
};

export type FieldDataBlock = {
  available: boolean;
  scope: "url" | "origin" | null;
  loadingExperience: Record<string, unknown> | null;
  originLoadingExperience: Record<string, unknown> | null;
  metricsNormalized: FieldMetricNorm[];
  notes: string[];
};

export type NormalizedAudit = {
  id: string;
  title: string | null;
  description: string | null;
  score: number | null;
  scoreDisplayMode: string | null;
  displayValue: string | null;
  numericValue: number | null;
  details: unknown;
  warnings: string[] | null;
  /** Texto curto para relatório (primeiras linhas da descrição ou explanation). */
  explanationSnippet: string | null;
};

export type ScreenshotInfo = {
  fullPageDataUrl: string | null;
  thumbnailDataUrl: string | null;
  /** Indica se veio do audit `final-screenshot` / `screenshot-thumbnails`. */
  sourceAuditIds: string[];
};

export type ProfileNorm = {
  strategy: ProfileStrategy;
  source: "pagespeed_insights_api_v5";
  status: CollectionStatus;
  meta: {
    finalUrl: string | null;
    requestedUrl: string | null;
    lighthouseVersion: string | null;
    fetchTime: string | null;
    userAgent: string | null;
    environment: Record<string, unknown> | null;
    runtimeError: { message: string } | null;
    analysisTimestamp: string | null;
  };
  categories: CategoryScoreNorm[];
  metrics: Record<string, MetricNorm>;
  fieldData: FieldDataBlock;
  auditsAll: NormalizedAudit[];
  opportunities: NormalizedAudit[];
  diagnostics: NormalizedAudit[];
  screenshots: ScreenshotInfo;
  stackPacks: unknown[] | null;
  entities: unknown;
  runWarnings: string[] | null;
  /** Referência opcional ao ficheiro JSON bruto gravado em disco. */
  rawPayloadPath?: string;
};

export type PriorityLevel = "P1" | "P2" | "P3";

export type PrioritizedIssue = {
  level: PriorityLevel;
  code: string;
  message: string;
  strategy?: ProfileStrategy;
  /** Métrica ou audit relacionado. */
  ref?: string;
  kind: "performance" | "accessibility" | "seo" | "operational" | "observation";
};

export type ExecutiveSummary = {
  /** Frases geradas por regras explícitas (derived). */
  bullets: string[];
  worstProblems: PrioritizedIssue[];
  bestSignals: PrioritizedIssue[];
  fieldDataAvailable: boolean;
  mobileVsDesktop: {
    performanceDelta01: number | null;
    note: string | null;
  };
  notes: string[];
};

export type UrlPagespeedApiResult = {
  url: string;
  requestedAt: string;
  profiles: {
    mobile: ProfileNorm;
    desktop: ProfileNorm;
  };
  summary: ExecutiveSummary;
};

export type ConsolidatedReport = {
  generatedAt: string;
  mode: "pagespeed_api_only";
  apiVersion: "v5";
  urls: UrlPagespeedApiResult[];
  batchNotes: string[];
};

/** Payload bruto da API (estrutura flexível). */
export type PagespeedApiRawResponse = Record<string, unknown>;
