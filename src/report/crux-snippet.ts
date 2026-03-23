import type { UrlAuditResult } from "../runner.js";
import type { CruxFieldMetrics } from "../pagespeed-field.js";
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

function renderMetricsTable(mob: CruxFieldMetrics | null, desk: CruxFieldMetrics | null): string {
  if (!mob && !desk) return "";
  let md = "| Métrica (≈ p75 campo) | Mobile | Desktop |\n|---|---|---|\n";
  md += rowMetric(
    "LCP",
    mob?.lcpMs != null ? fmtMs(mob.lcpMs) : "—",
    desk?.lcpMs != null ? fmtMs(desk.lcpMs) : "—"
  );
  md += rowMetric(
    "INP",
    fmtInp(mob?.inpMs ?? null),
    fmtInp(desk?.inpMs ?? null)
  );
  md += rowMetric(
    "CLS",
    fmtCls(mob?.cls ?? null),
    fmtCls(desk?.cls ?? null)
  );
  md += rowMetric(
    "FCP",
    mob?.fcpMs != null ? fmtMs(mob.fcpMs) : "—",
    desk?.fcpMs != null ? fmtMs(desk.fcpMs) : "—"
  );
  md += rowMetric(
    "TTFB",
    mob?.ttfbMs != null ? fmtMs(mob.ttfbMs) : "—",
    desk?.ttfbMs != null ? fmtMs(desk.ttfbMs) : "—"
  );
  return md;
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
    md += `**Geral:** mobile \`${mobile.data.overallCategory ?? "—"}\` · desktop \`${desktop.data.overallCategory ?? "—"}\`\n\n`;
    md += renderMetricsTable(mobile.data, desktop.data);
    md += `\n`;
  } else if (mobile.ok) {
    md += renderMetricsTable(mobile.data, null);
  } else if (desktop.ok) {
    md += renderMetricsTable(null, desktop.data);
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
    body += `<p class="muted">Categoria geral: mobile <strong>${esc(m.overallCategory ?? "—")}</strong> · desktop <strong>${esc(d.overallCategory ?? "—")}</strong></p>`;
    body += `<table class="data-table"><thead><tr><th>Métrica (≈ p75)</th><th>Mobile</th><th>Desktop</th></tr></thead><tbody>`;
    body += cells("LCP", m.lcpMs != null ? esc(fmtMs(m.lcpMs)) : "—", d.lcpMs != null ? esc(fmtMs(d.lcpMs)) : "—");
    body += cells("INP", esc(fmtInp(m.inpMs)), esc(fmtInp(d.inpMs)));
    body += cells("CLS", esc(fmtCls(m.cls)), esc(fmtCls(d.cls)));
    body += cells("FCP", m.fcpMs != null ? esc(fmtMs(m.fcpMs)) : "—", d.fcpMs != null ? esc(fmtMs(d.fcpMs)) : "—");
    body += cells("TTFB", m.ttfbMs != null ? esc(fmtMs(m.ttfbMs)) : "—", d.ttfbMs != null ? esc(fmtMs(d.ttfbMs)) : "—");
    body += `</tbody></table>`;
  } else if (mobile.ok) {
    const m = mobile.data;
    body += `<table class="data-table"><thead><tr><th>Métrica</th><th>Mobile</th></tr></thead><tbody>`;
    body += `<tr><td>LCP</td><td>${m.lcpMs != null ? esc(fmtMs(m.lcpMs)) : "—"}</td></tr>`;
    body += `<tr><td>INP</td><td>${esc(fmtInp(m.inpMs))}</td></tr>`;
    body += `<tr><td>CLS</td><td>${esc(fmtCls(m.cls))}</td></tr>`;
    body += `</tbody></table>`;
  } else if (desktop.ok) {
    const d = desktop.data;
    body += `<table class="data-table"><thead><tr><th>Métrica</th><th>Desktop</th></tr></thead><tbody>`;
    body += `<tr><td>LCP</td><td>${d.lcpMs != null ? esc(fmtMs(d.lcpMs)) : "—"}</td></tr>`;
    body += `<tr><td>INP</td><td>${esc(fmtInp(d.inpMs))}</td></tr>`;
    body += `<tr><td>CLS</td><td>${esc(fmtCls(d.cls))}</td></tr>`;
    body += `</tbody></table>`;
  }

  return `<section class="card crux-block">
<h3>Dados de campo (CrUX / PageSpeed Insights)</h3>
${body}
</section>`;
}
