import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../config.js";
import type { ConsolidatedReport } from "./types.js";

export function writeConsolidatedJson(
  report: ConsolidatedReport,
  filename: string
): string {
  const root = projectRoot();
  const dir = join(root, "reports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf-8");
  return path;
}

export function buildExecutiveMarkdown(report: ConsolidatedReport): string {
  let md = `# PageSpeed Insights API — resumo executivo\n\n`;
  md += `Gerado em **${report.generatedAt}** · modo \`${report.mode}\` · API ${report.apiVersion}\n\n`;
  if (report.batchNotes.length > 0) {
    md += `## Notas do lote\n\n`;
    for (const n of report.batchNotes) md += `- ${n}\n`;
    md += `\n`;
  }
  for (const u of report.urls) {
    md += `## ${u.url}\n\n`;
    md += `**Pedido em:** ${u.requestedAt}\n\n`;
    md += `### Resumo (regras)\n\n`;
    for (const b of u.summary.bullets) {
      md += `- ${b}\n`;
    }
    md += `\n### Prioridades\n\n`;
    for (const w of u.summary.worstProblems.slice(0, 12)) {
      md += `- **${w.level}** [${w.code}] ${w.message}${w.strategy ? ` (${w.strategy})` : ""}\n`;
    }
    md += `\n### Scores (lab) — mobile\n\n`;
    for (const c of u.profiles.mobile.categories) {
      if (c.score100 !== null) {
        md += `- ${c.id}: ${c.score100}/100\n`;
      }
    }
    md += `\n### Scores (lab) — desktop\n\n`;
    for (const c of u.profiles.desktop.categories) {
      if (c.score100 !== null) {
        md += `- ${c.id}: ${c.score100}/100\n`;
      }
    }
    md += `\n---\n\n`;
  }
  return md;
}
