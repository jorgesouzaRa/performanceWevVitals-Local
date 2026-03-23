/**
 * Dados de campo (CrUX) via PageSpeed Insights API v5 — mesma origem que o PSI
 * (“Descubra o que seus usuários reais estão vivenciando”).
 */

export type CruxFieldMetrics = {
  sourceId: string | null;
  overallCategory: string | null;
  /** Percentil ~p75, ms */
  lcpMs: number | null;
  /** INP, ms */
  inpMs: number | null;
  /** CLS (0–1) */
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
};

type MetricEntry = { percentile?: number; category?: string };

type LoadingExperience = {
  id?: string;
  overall_category?: string;
  metrics?: Record<string, MetricEntry>;
};

type PsiResponse = {
  loadingExperience?: LoadingExperience;
  error?: { code: number; message: string };
};

function pickMetric(
  metrics: Record<string, MetricEntry> | undefined,
  ...keySubstrings: string[]
): number | null {
  if (!metrics) return null;
  for (const sub of keySubstrings) {
    const key = Object.keys(metrics).find(
      (k) => k === sub || k.toUpperCase().includes(sub.toUpperCase())
    );
    if (key && metrics[key]?.percentile !== undefined) {
      return metrics[key].percentile!;
    }
  }
  return null;
}

/** CLS no CrUX/PSI: percentil × 100 (ex.: 8 → 0,08). */
function normalizeCls(percentile: number | null): number | null {
  if (percentile === null) return null;
  if (percentile <= 1 && Number.isFinite(percentile)) return percentile;
  return percentile / 100;
}

export function parseLoadingExperience(le: LoadingExperience | undefined): CruxFieldMetrics {
  const m = le?.metrics;
  const lcp = pickMetric(m, "LARGEST_CONTENTFUL_PAINT_MS");
  const inp =
    pickMetric(m, "INTERACTION_TO_NEXT_PAINT") ??
    pickMetric(m, "EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT");
  const clsRaw = pickMetric(m, "CUMULATIVE_LAYOUT_SHIFT_SCORE");
  const fcp = pickMetric(m, "FIRST_CONTENTFUL_PAINT_MS");
  const ttfb =
    pickMetric(m, "EXPERIMENTAL_TIME_TO_FIRST_BYTE") ??
    pickMetric(m, "TIME_TO_FIRST_BYTE");

  return {
    sourceId: le?.id ?? null,
    overallCategory: le?.overall_category ?? null,
    lcpMs: lcp,
    inpMs: inp,
    cls: normalizeCls(clsRaw),
    fcpMs: fcp,
    ttfbMs: ttfb,
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
  endpoint.searchParams.set("category", "performance");

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
    const le = json.loadingExperience;
    if (!le?.metrics || Object.keys(le.metrics).length === 0) {
      return {
        ok: false,
        strategy,
        error:
          "Sem métricas de campo para esta URL (amostras insuficientes no CrUX). O PSI pode mostrar só origem ou “—”.",
      };
    }
    return {
      ok: true,
      strategy,
      data: parseLoadingExperience(le),
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
