import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LighthouseSummary } from "../lighthouse-audit.js";
import type { UrlAuditResult } from "../runner.js";
import { cruxBlockHtml, cruxIntroHtml } from "./crux-snippet.js";
import { fmtMs, fmtScore, REPORT_LINKS, vitalsRating } from "./helpers.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeClass(kind: "good" | "warn" | "bad" | "neutral"): string {
  return `badge badge-${kind}`;
}

function clsForLcp(ms: number | null): "good" | "warn" | "bad" | "neutral" {
  if (ms === null) return "neutral";
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "warn";
  return "bad";
}

function clsForCls(v: number | null): "good" | "warn" | "bad" | "neutral" {
  if (v === null) return "neutral";
  if (v <= 0.1) return "good";
  if (v <= 0.25) return "warn";
  return "bad";
}

function qualitativeAdsHtml(docPath: string): string {
  if (!existsSync(docPath)) {
    return `<section class="card"><h2>Monetização / anúncios</h2><p>Arquivo de mapeamento não encontrado em <code>${esc(docPath)}</code>.</p></section>`;
  }
  const txt = readFileSync(docPath, "utf-8");
  const lines = txt.split("\n").slice(0, 80).join("\n");
  return `<section class="card">
<h2>Monetização / anúncios</h2>
<p class="muted">Trecho do inventário interno (cruzar com slots reais no Ad Manager).</p>
<pre class="doc-snippet">${esc(lines)}\n(...)</pre>
<h3>Riscos comuns (ads × Web Vitals)</h3>
<table class="data-table">
<thead><tr><th>Risco</th><th>Impacto</th><th>Mitigação</th></tr></thead>
<tbody>
<tr><td>Muitos recursos acima da dobra</td><td>LCP alto</td><td><a href="${REPORT_LINKS.optLcp}" target="_blank" rel="noopener">Otimizar LCP</a></td></tr>
<tr><td>Slot sem espaço reservado</td><td>CLS alto</td><td><a href="${REPORT_LINKS.optCls}" target="_blank" rel="noopener">Otimizar CLS</a></td></tr>
<tr><td>Scripts de terceiros</td><td>TBT / INP</td><td><a href="${REPORT_LINKS.optInp}" target="_blank" rel="noopener">Otimizar INP</a></td></tr>
<tr><td>Sticky + bloco próximo</td><td>CLS, UX</td><td>Regras de densidade por página</td></tr>
</tbody>
</table>
</section>`;
}

function lhMetricsCard(label: string, lh: LighthouseSummary): string {
  if (!lh.ok) {
    return `<div class="lh-block"><h4>Lighthouse — ${esc(label)} <span class="muted">(laboratório)</span></h4><p class="error">Erro: ${esc(lh.error ?? "?")}</p></div>`;
  }
  const lcpC = clsForLcp(lh.lcpMs);
  const clsC = clsForCls(lh.cls);
  return `<div class="lh-block">
<h4>Lighthouse — ${esc(label)} <span class="muted">(laboratório local)</span></h4>
<div class="metric-grid">
<div class="metric"><span class="metric-label">Performance</span><span class="metric-value">${esc(fmtScore(lh.performanceScore))}</span></div>
<div class="metric"><span class="metric-label">Acessibilidade</span><span class="metric-value">${esc(fmtScore(lh.accessibilityScore))}</span></div>
<div class="metric"><span class="metric-label">LCP</span><span class="badge ${badgeClass(lcpC)}">${esc(fmtMs(lh.lcpMs))}</span></div>
<div class="metric"><span class="metric-label">CLS</span><span class="badge ${badgeClass(clsC)}">${esc(fmtScore(lh.cls))}</span></div>
<div class="metric"><span class="metric-label">TBT</span><span class="metric-value">${esc(fmtMs(lh.tbtMs))}</span></div>
<div class="metric"><span class="metric-label">FCP</span><span class="metric-value">${esc(fmtMs(lh.fcpMs))}</span></div>
<div class="metric"><span class="metric-label">Speed Index</span><span class="metric-value">${esc(fmtMs(lh.speedIndex))}</span></div>
</div>
${auditList("Performance — oportunidades", lh.failedPerformanceAudits.slice(0, 25))}
${auditList("Acessibilidade (Lighthouse)", lh.failedAccessibilityAudits.slice(0, 20))}
</div>`;
}

function auditList(title: string, items: { id: string; title: string; description: string }[]): string {
  if (items.length === 0) return "";
  let h = `<h5>${esc(title)}</h5><ul class="audit-list">`;
  for (const a of items) {
    const short = a.description.replace(/\s+/g, " ").slice(0, 280);
    h += `<li><strong>${esc(a.title)}</strong> <code>${esc(a.id)}</code><p class="muted">${esc(short)}${a.description.length > 280 ? "…" : ""}</p></li>`;
  }
  h += "</ul>";
  return h;
}

export function buildHtmlReport(
  results: UrlAuditResult[],
  options: { docMappingPath: string }
): string {
  const iso = new Date().toISOString().slice(0, 10);
  const css = `
:root {
  --bg: #0f1419;
  --surface: #1a2332;
  --border: #2d3a4d;
  --text: #e7ecf3;
  --muted: #8b9cb3;
  --accent: #3d8bfd;
  --good: #34d399;
  --warn: #fbbf24;
  --bad: #f87171;
  --code: #1e293b;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  padding: 1.5rem;
  max-width: 1200px;
  margin-inline: auto;
}
h1 { font-size: 1.75rem; margin-top: 0; }
h2 { font-size: 1.25rem; margin-top: 2rem; color: #fff; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
h3 { font-size: 1.05rem; }
a { color: var(--accent); }
.intro { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; margin: 1rem 0; }
.intro ul { margin: 0.5rem 0 0 1.25rem; color: var(--muted); }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  margin: 1.25rem 0;
}
.url-title { word-break: break-all; font-size: 1.1rem; }
.muted { color: var(--muted); font-size: 0.9rem; }
.error { color: var(--bad); }
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin: 0.75rem 0;
}
.data-table th, .data-table td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.65rem;
  text-align: left;
  vertical-align: top;
}
.data-table th { background: #243044; color: #cbd5e1; }
.data-table tr:nth-child(even) td { background: rgba(0,0,0,0.15); }
.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
}
.badge-good { background: rgba(52,211,153,0.2); color: var(--good); }
.badge-warn { background: rgba(251,191,36,0.15); color: var(--warn); }
.badge-bad { background: rgba(248,113,113,0.15); color: var(--bad); }
.badge-neutral { background: #334155; color: var(--muted); }
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.metric {
  background: var(--code);
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
}
.metric-label { display: block; font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.metric-value { font-size: 1.1rem; font-weight: 600; }
.lh-block { margin-top: 1.25rem; }
.lh-block h4 { margin: 0 0 0.5rem; color: #93c5fd; }
.audit-list { padding-left: 1.1rem; }
.audit-list li { margin-bottom: 0.75rem; }
.audit-list code { font-size: 0.75rem; background: var(--code); padding: 0.1rem 0.35rem; border-radius: 4px; }
.doc-snippet {
  background: var(--code);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  overflow: auto;
  max-height: 320px;
  font-size: 0.78rem;
  line-height: 1.4;
}
footer.links { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.9rem; }
.callout { border-left: 4px solid var(--accent); }
.callout-info { border-left-color: #22d3ee; background: rgba(34,211,238,0.06); }
.callout-warn { border-left-color: var(--warn); background: rgba(251,191,36,0.08); }
.crux-block { border-left: 4px solid #4ade80; }
`;

  let summaryRows = "";
  for (const r of results) {
    const addRow = (
      profile: string,
      perf: number | null,
      a11y: number | null,
      lcp: number | null,
      cls: number | null,
      tbt: number | null,
      err?: string
    ) => {
      if (err) {
        summaryRows += `<tr><td><a href="#${anchorId(r.url)}">${esc(r.url)}</a></td><td>${esc(profile)}</td><td colspan="6" class="error">${esc(err)}</td></tr>`;
        return;
      }
      const { lcp: rl, cls: rc, tbt: rt } = vitalsRating(lcp, cls, tbt);
      summaryRows += `<tr>
<td><a href="#${anchorId(r.url)}">${esc(r.url)}</a></td>
<td>${esc(profile)}</td>
<td>${esc(fmtScore(perf))}</td>
<td>${esc(fmtScore(a11y))}</td>
<td>${esc(fmtMs(lcp))}</td>
<td>${esc(fmtScore(cls))}</td>
<td>${esc(fmtMs(tbt))}</td>
<td class="muted">${esc(`LCP: ${rl}; CLS: ${rc}; TBT: ${rt}`)}</td>
</tr>`;
    };

    if (r.lighthouseMobile?.ok) {
      addRow(
        "mobile",
        r.lighthouseMobile.performanceScore,
        r.lighthouseMobile.accessibilityScore,
        r.lighthouseMobile.lcpMs,
        r.lighthouseMobile.cls,
        r.lighthouseMobile.tbtMs
      );
    } else if (r.lighthouseMobile && !r.lighthouseMobile.ok) {
      addRow("mobile", null, null, null, null, null, r.lighthouseMobile.error ?? "?");
    }

    if (r.lighthouseDesktop?.ok) {
      addRow(
        "desktop",
        r.lighthouseDesktop.performanceScore,
        r.lighthouseDesktop.accessibilityScore,
        r.lighthouseDesktop.lcpMs,
        r.lighthouseDesktop.cls,
        r.lighthouseDesktop.tbtMs
      );
    } else if (r.lighthouseDesktop && !r.lighthouseDesktop.ok) {
      addRow("desktop", null, null, null, null, null, r.lighthouseDesktop.error ?? "?");
    }
  }

  let detailSections = "";
  for (const r of results) {
    const id = anchorId(r.url);
    let axeHtml = "";
    if (!r.axe.ok && r.axe.error) {
      axeHtml = `<p class="error">Erro na análise axe: ${esc(r.axe.error)}</p>`;
    } else if (r.axe.violations.length === 0) {
      axeHtml = `<p>Nenhuma violação detectada pelas regras axe (wcag2a/aa). <span class="muted">Não garante conformidade WCAG total.</span></p>`;
    } else {
      axeHtml = `<p><strong>${r.axe.violations.length}</strong> violação(ões)</p><ul class="audit-list">`;
      for (const v of r.axe.violations) {
        axeHtml += `<li><strong>${esc(v.id)}</strong> <span class="badge ${v.impact === "critical" ? "badge-bad" : "badge-warn"}">${esc(v.impact ?? "?")}</span>
        <p>${esc(v.help)}</p>
        <p class="muted">Nós: ${v.nodes} · <a href="${esc(v.helpUrl)}" target="_blank" rel="noopener">Guia</a></p></li>`;
      }
      axeHtml += "</ul>";
      if (r.axe.incomplete.length > 0) {
        axeHtml += `<h5>Incompletos (revisão manual)</h5><ul class="audit-list">`;
        for (const i of r.axe.incomplete.slice(0, 12)) {
          axeHtml += `<li><code>${esc(i.id)}</code> — ${esc(i.help)}</li>`;
        }
        if (r.axe.incomplete.length > 12) {
          axeHtml += `<li class="muted">… e mais ${r.axe.incomplete.length - 12}</li>`;
        }
        axeHtml += "</ul>";
      }
    }

    let lhCombined = "";
    if (r.lighthouseMobile) lhCombined += lhMetricsCard("Mobile", r.lighthouseMobile);
    if (r.lighthouseDesktop) lhCombined += lhMetricsCard("Desktop", r.lighthouseDesktop);

    detailSections += `<section class="card" id="${id}">
<h2 class="url-title">${esc(r.url)}</h2>
${cruxBlockHtml(r)}
${r.playwrightError ? `<p class="error"><strong>Playwright:</strong> ${esc(r.playwrightError)}</p>` : ""}
<h3>Acessibilidade (axe)</h3>
${axeHtml}
${lhCombined}
</section>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Relatório Web Vitals + A11y — ${esc(iso)}</title>
<style>${css}</style>
</head>
<body>
<header>
<h1>Relatório: Web Vitals (laboratório) e acessibilidade</h1>
<p class="muted">Gerado em <strong>${esc(iso)}</strong> · ReclameAQUI / URLs configuradas</p>
</header>

<div class="intro">
<p><strong>Como interpretar:</strong></p>
<ul>
<li>Métricas de <strong>Lighthouse</strong> (laboratório), não CrUX/RUM. Limites “bons” referem-se a dados de campo — ver <a href="${REPORT_LINKS.webVitals}" target="_blank" rel="noopener">Web Vitals</a> e <a href="${REPORT_LINKS.cwvSearch}" target="_blank" rel="noopener">Search Central</a>.</li>
<li><strong>TBT</strong> é proxy para interatividade em lab; <strong>INP</strong> real exige campo.</li>
<li>Testes automáticos cobrem parte de <a href="${REPORT_LINKS.wcag}" target="_blank" rel="noopener">WCAG 2.1</a>.</li>
</ul>
</div>

${cruxIntroHtml()}

<section class="card">
<h2>Resumo — Lighthouse (laboratório)</h2>
<p class="muted">Esta tabela reflete auditorias sintéticas locais, não os percentis de utilizadores reais. Para CrUX, veja o bloco “Dados de campo” em cada URL.</p>
<table class="data-table">
<thead>
<tr>
<th>URL</th><th>Perfil</th><th>Perf</th><th>A11y</th><th>LCP</th><th>CLS</th><th>TBT</th><th>Notas (lab)</th>
</tr>
</thead>
<tbody>${summaryRows}</tbody>
</table>
</section>

${detailSections}

${qualitativeAdsHtml(options.docMappingPath)}

<footer class="links">
<p><strong>Referências:</strong>
<a href="${REPORT_LINKS.webVitals}" target="_blank" rel="noopener">Web Vitals</a> ·
<a href="${REPORT_LINKS.cwvSearch}" target="_blank" rel="noopener">Core Web Vitals (Search)</a> ·
<a href="${REPORT_LINKS.wcag}" target="_blank" rel="noopener">WCAG 2.1</a> ·
<a href="${REPORT_LINKS.optLcp}" target="_blank" rel="noopener">Otimizar LCP</a> ·
<a href="${REPORT_LINKS.optCls}" target="_blank" rel="noopener">Otimizar CLS</a> ·
<a href="${REPORT_LINKS.optInp}" target="_blank" rel="noopener">Otimizar INP</a>
</p>
</footer>
</body>
</html>`;
}

function anchorId(url: string): string {
  return `u-${hash(url)}`;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
