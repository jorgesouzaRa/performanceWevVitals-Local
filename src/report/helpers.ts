export const REPORT_LINKS = {
  webVitals: "https://web.dev/articles/vitals?hl=pt-br",
  cwvSearch: "https://developers.google.com/search/docs/appearance/core-web-vitals",
  wcag: "https://www.w3.org/TR/WCAG21/",
  optLcp: "https://web.dev/articles/optimize-lcp?hl=pt-br",
  optCls: "https://web.dev/articles/optimize-cls?hl=pt-br",
  optInp: "https://web.dev/articles/optimize-inp?hl=pt-br",
} as const;

export function fmtScore(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100) / 100}`;
}

export function fmtMs(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n)} ms`;
}

export function vitalsRating(
  lcpMs: number | null,
  cls: number | null,
  tbtMs: number | null
): { lcp: string; cls: string; tbt: string } {
  const lcp =
    lcpMs === null
      ? "—"
      : lcpMs <= 2500
        ? "bom (≤ 2,5 s)"
        : lcpMs <= 4000
          ? "precisa melhorar"
          : "ruim";
  const clsR =
    cls === null
      ? "—"
      : cls <= 0.1
        ? "bom (≤ 0,1)"
        : cls <= 0.25
          ? "precisa melhorar"
          : "ruim";
  const tbt =
    tbtMs === null
      ? "—"
      : tbtMs <= 200
        ? "TBT baixo (proxy útil para interatividade em lab)"
        : tbtMs <= 600
          ? "TBT moderado"
          : "TBT alto — possível impacto em INP no campo";
  return { lcp, cls: clsR, tbt };
}
