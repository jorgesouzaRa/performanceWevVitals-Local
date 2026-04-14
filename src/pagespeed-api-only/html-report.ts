import type { ConsolidatedReport } from "./types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Relatório HTML enxuto consumível pelo browser; dados completos ficam no JSON consolidado. */
export function buildPagespeedApiHtmlReport(report: ConsolidatedReport): string {
  const rows: string[] = [];
  for (const u of report.urls) {
    const mPerf =
      u.profiles.mobile.categories.find((c) => c.id === "performance")?.score100 ??
      "—";
    const dPerf =
      u.profiles.desktop.categories.find((c) => c.id === "performance")?.score100 ??
      "—";
    const bullets = u.summary.bullets.map((b) => `<li>${esc(b)}</li>`).join("");
    rows.push(`<tr>
<td class="url"><a href="${esc(u.url)}">${esc(u.url)}</a></td>
<td>${esc(String(mPerf))}</td>
<td>${esc(String(dPerf))}</td>
<td><ul class="bullets">${bullets}</ul></td>
</tr>`);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PageSpeed API — ${esc(report.generatedAt.slice(0, 10))}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #0f1419; color: #e7ecf3; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { border: 1px solid #334155; padding: 0.5rem 0.65rem; vertical-align: top; }
th { background: #1e293b; text-align: left; }
tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
.url { max-width: 28rem; word-break: break-all; }
.bullets { margin: 0; padding-left: 1.1rem; }
.muted { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1rem; }
h1 { font-size: 1.35rem; }
a { color: #38bdf8; }
</style>
</head>
<body>
<h1>Relatório PageSpeed Insights API (v5)</h1>
<p class="muted">Modo <code>pagespeed_api_only</code> · ${esc(report.generatedAt)} · Dados de laboratório e campo conforme payload da API oficial.</p>
<table>
<thead>
<tr><th>URL</th><th>Perf (mobile)</th><th>Perf (desktop)</th><th>Resumo (regras)</th></tr>
</thead>
<tbody>
${rows.join("\n")}
</tbody>
</table>
<p class="muted">Para métricas completas, audits e JSON bruto, use o ficheiro <code>reports/pagespeed-api-consolidated-*.json</code>.</p>
</body>
</html>`;
}
