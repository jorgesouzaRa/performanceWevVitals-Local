import type { UrlAuditResult } from "../runner.js";
import type { CruxFieldMetrics, PsiLabScores } from "../pagespeed-field.js";
import { fmtMs } from "./helpers.js";

const PSI = "https://pagespeed.web.dev/";

function fmtCls(c: number | null): string {
  if (c === null) return "—";
  return `${Math.round(c * 1000) / 1000}`;
}

function fmtInp(ms: number | null): string {
  if (ms === null) return "—";
  return `${ms} ms`;
}

function rowMetric(label: string, mob: string, desk: string): string {
  return `| ${label} | ${mob} | ${desk} |\n`;
}

function tagCat(cat: string | null | undefined): string {
  if (!cat) return "";
  return ` (${cat})`;
}

function cellTime(ms: number | null, cat: string | null | undefined): string {
  if (ms == null) return "—";
  return `${fmtMs(ms)}${tagCat(cat)}`;
}

function cellCls(c: number | null, cat: string | null | undefined): string {
  if (c === null) return "—";
  return `${fmtCls(c)}${tagCat(cat)}`;
}

function cellInp(ms: number | null, cat: string | null | undefined): string {
  if (ms == null) return "—";
  return `${fmtInp(ms)}${tagCat(cat)}`;
}

function fmtPsiScore(s: number | null): string {
  if (s == null) return "—";
  return `${Math.round(s * 100)}%`;
}

function renderPsiLabMarkdown(mob: PsiLabScores | null, desk: PsiLabScores | null): string {
  if (!mob && !desk) return "";
  const has =
    (mob &&
      (mob.performance != null ||
        mob.accessibility != null ||
        mob.bestPractices != null ||
        mob.seo != null)) ||
    (desk &&
      (desk.performance != null ||
        desk.accessibility != null ||
        desk.bestPractices != null ||
        desk.seo != null));
  if (!has) return "";

  let md =
    "\n**Lighthouse (laboratório Google / mesmo run da API):**\n\n| Categoria | Mobile | Desktop |\n|---|---|---|\n";
  md += rowMetric("Performance", fmtPsiScore(mob?.performance ?? null), fmtPsiScore(desk?.performance ?? null));
  md += rowMetric(
    "Acessibilidade",
    fmtPsiScore(mob?.accessibility ?? null),
    fmtPsiScore(desk?.accessibility ?? null)
  );
  md += rowMetric(
    "Boas práticas",
    fmtPsiScore(mob?.bestPractices ?? null),
    fmtPsiScore(desk?.bestPractices ?? null)
  );
  md += rowMetric("SEO", fmtPsiScore(mob?.seo ?? null), fmtPsiScore(desk?.seo ?? null));
  md +=
    "\n_Valores do PSI na nuvem; o relatório também inclui Lighthouse executado localmente — podem diferir._\n";
  return md;
}

function renderMetricsTable(mob: CruxFieldMetrics | null, desk: CruxFieldMetrics | null): string {
  if (!mob && !desk) return "";
  let md = "| Métrica (≈ p75 campo) | Mobile | Desktop |\n|---|---|---|\n";
  md += rowMetric("LCP", cellTime(mob?.lcpMs ?? null, mob?.lcpCategory), cellTime(desk?.lcpMs ?? null, desk?.lcpCategory));
  md += rowMetric(
    "INP",
    cellInp(mob?.inpMs ?? null, mob?.inpCategory),
    cellInp(desk?.inpMs ?? null, desk?.inpCategory)
  );
  md += rowMetric("CLS", cellCls(mob?.cls ?? null, mob?.clsCategory), cellCls(desk?.cls ?? null, desk?.clsCategory));
  md += rowMetric(
    "FCP",
    cellTime(mob?.fcpMs ?? null, mob?.fcpCategory),
    cellTime(desk?.fcpMs ?? null, desk?.fcpCategory)
  );
  md += rowMetric(
    "TTFB",
    cellTime(mob?.ttfbMs ?? null, mob?.ttfbCategory),
    cellTime(desk?.ttfbMs ?? null, desk?.ttfbCategory)
  );
  return md;
}

function scopeNoteMd(mob: CruxFieldMetrics | null, desk: CruxFieldMetrics | null): string {
  const scope = mob?.fieldDataScope ?? desk?.fieldDataScope;
  if (scope === "origin") {
    return "_CrUX ao nível da **origem** (a página não tinha amostras URL no CrUX; agregado da origem, como no PSI)._\n\n";
  }
  return "";
}

export function cruxIntroMarkdown(): string {
  return `## Campo (CrUX) vs laboratório (Lighthouse)

| Fonte | Descrição |
|-------|------------|
| **Dados de campo** | [Chrome UX Report](https://developer.chrome.com/docs/crux) via [PageSpeed Insights API](${PSI}) — percentis de utilizadores reais (janela ~28 dias), como em *“Descubra o que seus usuários reais estão vivenciando”* no PSI. |
| **Lighthouse local** | Um único carregamento sintético na sua máquina, com throttling de laboratório. **Não** é o mesmo número que o CrUX; use para regressões e lista de oportunidades. |

**Limites usuais (campo):** LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 para “bom” no percentil de referência ([Web Vitals](https://web.dev/articles/vitals?hl=pt-br)).

`;
}

export function cruxBlockMarkdown(r: UrlAuditResult): string {
  const cf = r.cruxField;
  if (!cf) return "";
  if (cf.status === "skipped") {
    return `### Dados de campo (CrUX)\n\n**Não obtidos:** ${cf.reason}\n\nPara alinhar ao PageSpeed Insights (secção de utilizadores reais), crie uma chave na Google Cloud, ative **PageSpeed Insights API** e defina \`PAGESPEED_API_KEY\` no ambiente.\n\n`;
  }

  let md = `### Dados de campo (CrUX / PageSpeed Insights)\n\n`;
  const { mobile, desktop } = cf;
  if (!mobile.ok) {
    md += `**Mobile:** ${mobile.error}\n\n`;
  }
  if (!desktop.ok) {
    md += `**Desktop:** ${desktop.error}\n\n`;
  }
  if (mobile.ok && desktop.ok) {
    md += scopeNoteMd(mobile.data, desktop.data);
    md += `**Geral:** mobile \`${mobile.data.overallCategory ?? "—"}\` · desktop \`${desktop.data.overallCategory ?? "—"}\`\n\n`;
    md += renderMetricsTable(mobile.data, desktop.data);
    md += renderPsiLabMarkdown(mobile.data.psiLabScores, desktop.data.psiLabScores);
    md += `\n`;
  } else if (mobile.ok) {
    md += scopeNoteMd(mobile.data, null);
    md += renderMetricsTable(mobile.data, null);
    md += renderPsiLabMarkdown(mobile.data.psiLabScores, null);
  } else if (desktop.ok) {
    md += scopeNoteMd(null, desktop.data);
    md += renderMetricsTable(null, desktop.data);
    md += renderPsiLabMarkdown(null, desktop.data.psiLabScores);
  }
  md += `\n`;
  return md;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cruxIntroHtml(): string {
  return `<section class="card callout callout-info">
<h2>Campo (CrUX) vs laboratório (Lighthouse)</h2>
<p><strong>Campo</strong> — métricas de utilizadores reais (~28 dias), obtidas pela API PageSpeed Insights (mesma base que o <a href="${PSI}" target="_blank" rel="noopener">PageSpeed Insights</a>).</p>
<p><strong>Laboratório</strong> — um carregamento sintético na sua máquina (Lighthouse). Os valores costumam ser <em>piores</em> que o CrUX por causa do throttling e de um único cold load; servem para oportunidades técnicas e regressões.</p>
<p class="muted">Metas comuns no campo: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1.</p>
</section>`;
}

function htmlCellTime(ms: number | null, cat: string | null | undefined): string {
  if (ms == null) return "—";
  const t = esc(fmtMs(ms));
  return cat ? `${t} <span class="muted">(${esc(cat)})</span>` : t;
}

function htmlCellCls(c: number | null, cat: string | null | undefined): string {
  if (c === null) return "—";
  const t = esc(fmtCls(c));
  return cat ? `${t} <span class="muted">(${esc(cat)})</span>` : t;
}

function htmlCellInp(ms: number | null, cat: string | null | undefined): string {
  if (ms == null) return "—";
  const t = esc(fmtInp(ms));
  return cat ? `${t} <span class="muted">(${esc(cat)})</span>` : t;
}

function htmlScopeNote(mob: CruxFieldMetrics | null, desk: CruxFieldMetrics | null): string {
  const scope = mob?.fieldDataScope ?? desk?.fieldDataScope;
  if (scope !== "origin") return "";
  return `<p class="muted">CrUX ao nível da <strong>origem</strong> — a página não tinha amostras suficientes no CrUX para métricas URL; mostram-se dados agregados da origem (como no PSI).</p>`;
}

function renderPsiLabHtml(mob: PsiLabScores | null, desk: PsiLabScores | null): string {
  const row = (label: string, vm: string, vd: string) =>
    `<tr><td>${esc(label)}</td><td>${vm}</td><td>${vd}</td></tr>`;
  const pct = (s: number | null) => (s == null ? "—" : esc(fmtPsiScore(s)));

  if (!mob && !desk) return "";
  const hasMob =
    mob &&
    (mob.performance != null ||
      mob.accessibility != null ||
      mob.bestPractices != null ||
      mob.seo != null);
  const hasDesk =
    desk &&
    (desk.performance != null ||
      desk.accessibility != null ||
      desk.bestPractices != null ||
      desk.seo != null);
  if (!hasMob && !hasDesk) return "";

  let inner = `<h4>Lighthouse (laboratório Google / PSI)</h4>`;
  inner += `<p class="muted">Mesmo pedido à API; complementa o Lighthouse executado na sua máquina.</p>`;
  inner += `<table class="data-table"><thead><tr><th>Categoria</th><th>Mobile</th><th>Desktop</th></tr></thead><tbody>`;
  inner += row("Performance", pct(mob?.performance ?? null), pct(desk?.performance ?? null));
  inner += row("Acessibilidade", pct(mob?.accessibility ?? null), pct(desk?.accessibility ?? null));
  inner += row("Boas práticas", pct(mob?.bestPractices ?? null), pct(desk?.bestPractices ?? null));
  inner += row("SEO", pct(mob?.seo ?? null), pct(desk?.seo ?? null));
  inner += `</tbody></table>`;
  return inner;
}

export function cruxBlockHtml(r: UrlAuditResult): string {
  const cf = r.cruxField;
  if (!cf) return "";
  if (cf.status === "skipped") {
    return `<section class="card callout callout-warn">
<h3>Dados de campo (CrUX)</h3>
<p><strong>Não obtidos:</strong> ${esc(cf.reason)}</p>
<p class="muted">Defina <code>PAGESPEED_API_KEY</code> (Google Cloud → PageSpeed Insights API) para ver os mesmos dados de “utilizadores reais” que no PSI.</p>
</section>`;
  }

  const { mobile, desktop } = cf;
  let body = "";

  const cells = (
    label: string,
    mv: string,
    dv: string
  ) => `<tr><td>${esc(label)}</td><td>${mv}</td><td>${dv}</td></tr>`;

  if (!mobile.ok) body += `<p class="error"><strong>Mobile:</strong> ${esc(mobile.error)}</p>`;
  if (!desktop.ok) body += `<p class="error"><strong>Desktop:</strong> ${esc(desktop.error)}</p>`;

  if (mobile.ok && desktop.ok) {
    const m = mobile.data;
    const d = desktop.data;
    body += htmlScopeNote(m, d);
    body += `<p class="muted">Categoria geral: mobile <strong>${esc(m.overallCategory ?? "—")}</strong> · desktop <strong>${esc(d.overallCategory ?? "—")}</strong></p>`;
    body += `<table class="data-table"><thead><tr><th>Métrica (≈ p75)</th><th>Mobile</th><th>Desktop</th></tr></thead><tbody>`;
    body += cells("LCP", htmlCellTime(m.lcpMs, m.lcpCategory), htmlCellTime(d.lcpMs, d.lcpCategory));
    body += cells("INP", htmlCellInp(m.inpMs, m.inpCategory), htmlCellInp(d.inpMs, d.inpCategory));
    body += cells("CLS", htmlCellCls(m.cls, m.clsCategory), htmlCellCls(d.cls, d.clsCategory));
    body += cells("FCP", htmlCellTime(m.fcpMs, m.fcpCategory), htmlCellTime(d.fcpMs, d.fcpCategory));
    body += cells("TTFB", htmlCellTime(m.ttfbMs, m.ttfbCategory), htmlCellTime(d.ttfbMs, d.ttfbCategory));
    body += `</tbody></table>`;
    body += renderPsiLabHtml(m.psiLabScores, d.psiLabScores);
  } else if (mobile.ok) {
    const m = mobile.data;
    body += htmlScopeNote(m, null);
    body += `<table class="data-table"><thead><tr><th>Métrica (≈ p75)</th><th>Mobile</th></tr></thead><tbody>`;
    body += `<tr><td>LCP</td><td>${htmlCellTime(m.lcpMs, m.lcpCategory)}</td></tr>`;
    body += `<tr><td>INP</td><td>${htmlCellInp(m.inpMs, m.inpCategory)}</td></tr>`;
    body += `<tr><td>CLS</td><td>${htmlCellCls(m.cls, m.clsCategory)}</td></tr>`;
    body += `<tr><td>FCP</td><td>${htmlCellTime(m.fcpMs, m.fcpCategory)}</td></tr>`;
    body += `<tr><td>TTFB</td><td>${htmlCellTime(m.ttfbMs, m.ttfbCategory)}</td></tr>`;
    body += `</tbody></table>`;
    body += renderPsiLabHtml(m.psiLabScores, null);
  } else if (desktop.ok) {
    const d = desktop.data;
    body += htmlScopeNote(null, d);
    body += `<table class="data-table"><thead><tr><th>Métrica (≈ p75)</th><th>Desktop</th></tr></thead><tbody>`;
    body += `<tr><td>LCP</td><td>${htmlCellTime(d.lcpMs, d.lcpCategory)}</td></tr>`;
    body += `<tr><td>INP</td><td>${htmlCellInp(d.inpMs, d.inpCategory)}</td></tr>`;
    body += `<tr><td>CLS</td><td>${htmlCellCls(d.cls, d.clsCategory)}</td></tr>`;
    body += `<tr><td>FCP</td><td>${htmlCellTime(d.fcpMs, d.fcpCategory)}</td></tr>`;
    body += `<tr><td>TTFB</td><td>${htmlCellTime(d.ttfbMs, d.ttfbCategory)}</td></tr>`;
    body += `</tbody></table>`;
    body += renderPsiLabHtml(null, d.psiLabScores);
  }

  return `<section class="card crux-block">
<h3>Dados de campo (CrUX / PageSpeed Insights)</h3>
<p class="muted">Cada URL: duas chamadas à API (<strong>strategy=mobile</strong> e <strong>desktop</strong>) em paralelo.</p>
${body}
</section>`;
}
