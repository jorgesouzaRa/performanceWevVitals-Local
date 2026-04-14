import type {
  ExecutiveSummary,
  PrioritizedIssue,
  ProfileNorm,
  ProfileStrategy,
  UrlPagespeedApiResult,
} from "./types.js";

function scorePerf(p: ProfileNorm): number | null {
  const c = p.categories.find((x) => x.id === "performance");
  return c?.score01 ?? null;
}

function scoreCat(p: ProfileNorm, id: string): number | null {
  return p.categories.find((x) => x.id === id)?.score01 ?? null;
}

function lcpMs(p: ProfileNorm): number | null {
  return p.metrics.lcp?.numericValue ?? null;
}

function clsVal(p: ProfileNorm): number | null {
  return p.metrics.cls?.numericValue ?? null;
}

function tbtMs(p: ProfileNorm): number | null {
  return p.metrics.tbt?.numericValue ?? null;
}

/** Regras explícitas — todas as frases são determinísticas (derived). */
export function buildExecutiveSummary(
  mobile: ProfileNorm,
  desktop: ProfileNorm,
  url: string
): ExecutiveSummary {
  const bullets: string[] = [];
  const notes: string[] = [];
  const worstProblems: PrioritizedIssue[] = [];
  const bestSignals: PrioritizedIssue[] = [];

  const mOk = mobile.status.kind === "ok" || mobile.status.kind === "partial";
  const dOk = desktop.status.kind === "ok" || desktop.status.kind === "partial";

  if (!mOk) {
    bullets.push(
      `Mobile: falha de coleta (${mobile.status.message ?? mobile.status.errorKind ?? "erro"}).`
    );
    worstProblems.push({
      level: "P1",
      code: "collect_mobile",
      message: mobile.status.message ?? "Erro mobile",
      strategy: "mobile",
      kind: "operational",
    });
  }
  if (!dOk) {
    bullets.push(
      `Desktop: falha de coleta (${desktop.status.message ?? desktop.status.errorKind ?? "erro"}).`
    );
    worstProblems.push({
      level: "P1",
      code: "collect_desktop",
      message: desktop.status.message ?? "Erro desktop",
      strategy: "desktop",
      kind: "operational",
    });
  }

  const fieldM = mobile.fieldData.available;
  const fieldD = desktop.fieldData.available;
  const fieldDataAvailable = fieldM || fieldD;
  if (!fieldDataAvailable) {
    bullets.push("Sem dados de campo (CrUX) nesta resposta — apenas laboratório Lighthouse via API.");
    notes.push("Ausência de field data: observação, não indica bug da página.");
  } else {
    bullets.push(
      `Dados de campo: ${fieldM ? "mobile" : ""}${fieldM && fieldD ? " e " : ""}${fieldD ? "desktop" : ""} (${mobile.fieldData.scope ?? desktop.fieldData.scope ?? "?"}).`
    );
  }

  const takePerf = (p: ProfileNorm, label: ProfileStrategy) => {
    if (p.status.kind === "error") return;
    const lcp = lcpMs(p);
    const cls = clsVal(p);
    const tbt = tbtMs(p);
    if (lcp !== null) {
      if (lcp > 4000) {
        bullets.push(`${label}: LCP ruim (${Math.round(lcp)} ms > 4000 ms).`);
        worstProblems.push({
          level: "P1",
          code: "lcp_bad",
          message: `LCP ${Math.round(lcp)} ms`,
          strategy: label,
          kind: "performance",
          ref: "lcp",
        });
      } else if (lcp > 2500) {
        bullets.push(`${label}: LCP precisa melhorar (${Math.round(lcp)} ms).`);
        worstProblems.push({
          level: "P2",
          code: "lcp_warn",
          message: `LCP ${Math.round(lcp)} ms`,
          strategy: label,
          kind: "performance",
          ref: "lcp",
        });
      }
    }
    if (cls !== null) {
      if (cls > 0.25) {
        bullets.push(`${label}: CLS alto (${cls.toFixed(3)}) — layout instável.`);
        worstProblems.push({
          level: "P1",
          code: "cls_bad",
          message: `CLS ${cls.toFixed(3)}`,
          strategy: label,
          kind: "performance",
          ref: "cls",
        });
      } else if (cls > 0.1) {
        bullets.push(`${label}: CLS precisa melhorar (${cls.toFixed(3)}).`);
        worstProblems.push({
          level: "P2",
          code: "cls_warn",
          message: `CLS ${cls.toFixed(3)}`,
          strategy: label,
          kind: "performance",
          ref: "cls",
        });
      }
    }
    if (tbt !== null && tbt > 600) {
      bullets.push(
        `${label}: TBT alto (${Math.round(tbt)} ms) — possível impacto em interatividade (lab).`
      );
      worstProblems.push({
        level: tbt > 1000 ? "P1" : "P2",
        code: "tbt_high",
        message: `TBT ${Math.round(tbt)} ms`,
        strategy: label,
        kind: "performance",
        ref: "tbt",
      });
    }

    const a11y = scoreCat(p, "accessibility");
    if (a11y !== null && a11y < 0.5) {
      bullets.push(`${label}: acessibilidade baixa (score ~${Math.round(a11y * 100)}).`);
      worstProblems.push({
        level: "P2",
        code: "a11y_low",
        message: `A11y ${Math.round(a11y * 100)}`,
        strategy: label,
        kind: "accessibility",
      });
    } else if (a11y !== null && a11y >= 0.9) {
      bestSignals.push({
        level: "P3",
        code: "a11y_ok",
        message: `${label} acessibilidade boa`,
        strategy: label,
        kind: "accessibility",
      });
    }

    const seo = scoreCat(p, "seo");
    if (seo !== null && seo >= 0.9) {
      bullets.push(`${label}: SEO bom (~${Math.round(seo * 100)}).`);
      bestSignals.push({
        level: "P3",
        code: "seo_ok",
        message: `SEO ${Math.round(seo * 100)}`,
        strategy: label,
        kind: "seo",
      });
    } else if (seo !== null && seo < 0.7) {
      bullets.push(`${label}: SEO com margem para melhorar.`);
      worstProblems.push({
        level: "P3",
        code: "seo_low",
        message: `SEO ${Math.round(seo * 100)}`,
        strategy: label,
        kind: "seo",
      });
    }
  };

  takePerf(mobile, "mobile");
  takePerf(desktop, "desktop");

  const pm = scorePerf(mobile);
  const pd = scorePerf(desktop);
  let performanceDelta01: number | null = null;
  let mobileVsNote: string | null = null;
  if (pm !== null && pd !== null) {
    performanceDelta01 = pd - pm;
    if (performanceDelta01 > 0.08) {
      mobileVsNote = "Desktop melhor que mobile em performance (lab).";
      bullets.push(mobileVsNote);
    } else if (performanceDelta01 < -0.08) {
      mobileVsNote = "Mobile melhor que desktop em performance (lab) — verificar anomalias.";
      bullets.push(mobileVsNote);
    } else {
      mobileVsNote = "Performance lab semelhante entre mobile e desktop.";
    }
  }

  const healthy =
    mOk &&
    dOk &&
    (lcpMs(mobile) ?? 0) <= 2500 &&
    (lcpMs(desktop) ?? 0) <= 2500 &&
    (clsVal(mobile) ?? 0) <= 0.1 &&
    (clsVal(desktop) ?? 0) <= 0.1;

  const critical =
    worstProblems.some((w) => w.level === "P1" && w.kind === "performance") ||
    (pm !== null && pm < 0.35) ||
    (pd !== null && pd < 0.35);

  if (critical) {
    bullets.push("Página crítica para performance (lab) — priorizar oportunidades.");
  } else if (healthy && worstProblems.filter((w) => w.level === "P1").length === 0) {
    bullets.push("Página relativamente saudável nos indicadores principais (lab).");
  }

  if (mobile.status.kind === "partial" || desktop.status.kind === "partial") {
    notes.push("runtimeError ou avisos no Lighthouse — resultado pode estar parcial.");
  }

  notes.push(`URL analisada: ${url}`);

  return {
    bullets,
    worstProblems: sortIssues(worstProblems),
    bestSignals,
    fieldDataAvailable,
    mobileVsDesktop: {
      performanceDelta01,
      note: mobileVsNote,
    },
    notes,
  };
}

function sortIssues(issues: PrioritizedIssue[]): PrioritizedIssue[] {
  const rank = { P1: 0, P2: 1, P3: 2 };
  return [...issues].sort(
    (a, b) => rank[a.level] - rank[b.level] || a.code.localeCompare(b.code)
  );
}

export function buildUrlResult(
  url: string,
  mobile: ProfileNorm,
  desktop: ProfileNorm,
  requestedAt: string
): UrlPagespeedApiResult {
  return {
    url,
    requestedAt,
    profiles: { mobile, desktop },
    summary: buildExecutiveSummary(mobile, desktop, url),
  };
}
