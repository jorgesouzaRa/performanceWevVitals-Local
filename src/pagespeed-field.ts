/**
 * Dados de campo (CrUX) via PageSpeed Insights API v5 — mesma origem que o PSI
 * (“Descubra o que seus usuários reais estão vivenciando”).
 */

/** Pontuações Lighthouse devolvidas pelo próprio PSI (laboratório Google), 0–1. */
export type PsiLabScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

export type CruxFieldMetrics = {
  sourceId: string | null;
  overallCategory: string | null;
  /**
   * `url` = CrUX para a página; `origin` = fallback quando a URL não tem amostras
   * (agregado da origem, como no PSI).
   */
  fieldDataScope: "url" | "origin" | null;
  /** Percentil ~p75, ms */
  lcpMs: number | null;
  lcpCategory: string | null;
  /** INP, ms */
  inpMs: number | null;
  inpCategory: string | null;
  /** CLS (0–1) */
  cls: number | null;
  clsCategory: string | null;
  fcpMs: number | null;
  fcpCategory: string | null;
  ttfbMs: number | null;
  ttfbCategory: string | null;
  /** Lighthouse no mesmo run da API (categorias pedidas ao PSI). */
  psiLabScores: PsiLabScores | null;
};

type MetricEntry = { percentile?: number; category?: string };

type LoadingExperience = {
  id?: string;
  overall_category?: string;
  metrics?: Record<string, MetricEntry>;
};

type PsiResponse = {
  loadingExperience?: LoadingExperience;
  originLoadingExperience?: LoadingExperience;
  lighthouseResult?: { categories?: Record<string, { score?: number | null }> };
  error?: { code: number; message: string };
};

function pickMetricDetail(
  metrics: Record<string, MetricEntry> | undefined,
  ...keySubstrings: string[]
): { value: number | null; category: string | null } {
  if (!metrics) return { value: null, category: null };
  for (const sub of keySubstrings) {
    const key = Object.keys(metrics).find(
      (k) => k === sub || k.toUpperCase().includes(sub.toUpperCase())
    );
    if (key && metrics[key]?.percentile !== undefined) {
      return {
        value: metrics[key].percentile!,
        category: metrics[key].category ?? null,
      };
    }
  }
  return { value: null, category: null };
}

/** CLS no CrUX/PSI: percentil × 100 (ex.: 8 → 0,08). */
function normalizeCls(percentile: number | null): number | null {
  if (percentile === null) return null;
  if (percentile <= 1 && Number.isFinite(percentile)) return percentile;
  return percentile / 100;
}

function parsePsiLabScores(json: PsiResponse): PsiLabScores | null {
  const cats = json.lighthouseResult?.categories;
  if (!cats) return null;
  const s = (id: string): number | null => {
    const raw = cats[id]?.score;
    return typeof raw === "number" ? raw : null;
  };
  const out: PsiLabScores = {
    performance: s("performance"),
    accessibility: s("accessibility"),
    bestPractices: s("best-practices"),
    seo: s("seo"),
  };
  if (
    out.performance == null &&
    out.accessibility == null &&
    out.bestPractices == null &&
    out.seo == null
  ) {
    return null;
  }
  return out;
}

function selectLoadingExperience(json: PsiResponse): {
  le: LoadingExperience | undefined;
  scope: "url" | "origin" | null;
} {
  const urlLe = json.loadingExperience;
  const originLe = json.originLoadingExperience;
  const urlHas = urlLe?.metrics && Object.keys(urlLe.metrics).length > 0;
  const originHas = originLe?.metrics && Object.keys(originLe.metrics).length > 0;
  if (urlHas) return { le: urlLe, scope: "url" };
  if (originHas) return { le: originLe, scope: "origin" };
  return { le: undefined, scope: null };
}

export function parseLoadingExperience(
  le: LoadingExperience | undefined,
  fieldDataScope: "url" | "origin" | null,
  psiLabScores: PsiLabScores | null
): CruxFieldMetrics {
  const m = le?.metrics;

  const lcp = pickMetricDetail(m, "LARGEST_CONTENTFUL_PAINT_MS");
  const inpA = pickMetricDetail(m, "INTERACTION_TO_NEXT_PAINT");
  const inpB = pickMetricDetail(m, "EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT");
  const inp = inpA.value != null ? inpA : inpB;
  const clsD = pickMetricDetail(m, "CUMULATIVE_LAYOUT_SHIFT_SCORE");
  const fcp = pickMetricDetail(m, "FIRST_CONTENTFUL_PAINT_MS");
  const ttfbA = pickMetricDetail(m, "EXPERIMENTAL_TIME_TO_FIRST_BYTE");
  const ttfbB = pickMetricDetail(m, "TIME_TO_FIRST_BYTE");
  const ttfb = ttfbA.value != null ? ttfbA : ttfbB;

  return {
    sourceId: le?.id ?? null,
    overallCategory: le?.overall_category ?? null,
    fieldDataScope,
    lcpMs: lcp.value,
    lcpCategory: lcp.category,
    inpMs: inp.value,
    inpCategory: inp.category,
    cls: normalizeCls(clsD.value),
    clsCategory: clsD.category,
    fcpMs: fcp.value,
    fcpCategory: fcp.category,
    ttfbMs: ttfb.value,
    ttfbCategory: ttfb.category,
    psiLabScores,
  };
}

export type FieldFetchResult =
  | { ok: true; strategy: "mobile" | "desktop"; data: CruxFieldMetrics }
  | { ok: false; strategy: "mobile" | "desktop"; error: string };

export async function fetchPagespeedFieldMetrics(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey: string
): Promise<FieldFetchResult> {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("key", apiKey);
  for (const cat of ["performance", "accessibility", "best-practices", "seo"] as const) {
    endpoint.searchParams.append("category", cat);
  }

  try {
    const res = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
    });
    const json = (await res.json()) as PsiResponse;
    if (!res.ok) {
      const msg =
        (json as { error?: { message?: string } }).error?.message ??
        `HTTP ${res.status}`;
      return { ok: false, strategy, error: msg };
    }
    const { le, scope } = selectLoadingExperience(json);
    if (!le?.metrics || Object.keys(le.metrics).length === 0 || !scope) {
      return {
        ok: false,
        strategy,
        error:
          "Sem métricas de campo para esta URL nem para a origem no CrUX (amostras insuficientes).",
      };
    }
    const psiLab = parsePsiLabScores(json);
    return {
      ok: true,
      strategy,
      data: parseLoadingExperience(le, scope, psiLab),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, strategy, error: msg };
  }
}

export async function fetchBothStrategies(
  url: string,
  apiKey: string
): Promise<{ mobile: FieldFetchResult; desktop: FieldFetchResult }> {
  const [mobile, desktop] = await Promise.all([
    fetchPagespeedFieldMetrics(url, "mobile", apiKey),
    fetchPagespeedFieldMetrics(url, "desktop", apiKey),
  ]);
  return { mobile, desktop };
}
