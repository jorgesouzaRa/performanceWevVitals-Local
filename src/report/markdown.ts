import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LighthouseSummary } from "../lighthouse-audit.js";
import type { UrlAuditResult } from "../runner.js";
import { cruxBlockMarkdown, cruxIntroMarkdown } from "./crux-snippet.js";
import { fmtMs, fmtScore, REPORT_LINKS, vitalsRating } from "./helpers.js";

const WEB_VITALS = REPORT_LINKS.webVitals;
const CWV_SEARCH = REPORT_LINKS.cwvSearch;
const WCAG = REPORT_LINKS.wcag;
const OPT_LCP = REPORT_LINKS.optLcp;
const OPT_CLS = REPORT_LINKS.optCls;
const OPT_INP = REPORT_LINKS.optInp;

function qualitativeAdsSection(docPath: string): string {
  if (!existsSync(docPath)) {
    return `### Monetização / anúncios (contexto)\n\nArquivo de mapeamento não encontrado em \`${docPath}\`. Use o inventário interno de slots (header, sticky, sidebar) ao priorizar otimizações.\n`;
  }
  const txt = readFileSync(docPath, "utf-8");
  const lines = txt.split("\n").slice(0, 80);
  return `### Monetização / anúncios (inventário — trecho do mapeamento)\n\nO relatório técnico acima não identifica slots do Ad Manager automaticamente. Cruzar com o inventário da equipe:\n\n\`\`\`\n${lines.join("\n")}\n(...)\n\`\`\`\n\n**Riscos comuns ligados a ads** (e mitigações):\n\n| Risco | Impacto em Web Vitals | Mitigação |\n|-------|------------------------|-----------|\n| Muitos recursos acima da dobra | LCP alto | Adiar carregamento de slots abaixo da dobra; priorizar LCP element ([guia](${OPT_LCP})) |\n| Slot sem espaço reservado | CLS alto | \`min-height\` / placeholder estável ([guia](${OPT_CLS})) |\n| Scripts de terceiros na thread principal | TBT/INP altos | Carregar sob demanda, dividir tarefas longas ([guia](${OPT_INP})) |\n| Sticky + bloco próximo | CLS e distração | Evitar competição visual; regras de densidade por página |\n`;
}

export function buildMarkdownReport(
  results: UrlAuditResult[],
  options: { docMappingPath: string }
): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);

  let md = `# Relatório: Web Vitals (laboratório) e acessibilidade\n\n`;
  md += `**Data:** ${iso}  \n`;
  md += `**Escopo:** URLs configuradas (ReclameAQUI e blog)  \n\n`;
  md += `## Como interpretar este relatório\n\n`;
  md += `- **Laboratório vs campo:** métricas aqui vêm de **Lighthouse** (Chrome controlado), não do CrUX/RUM. Os limites “bons” de LCP/CLS/INP referem-se ao uso típico em **dados de campo** ([Web Vitals](${WEB_VITALS}), [Search Central](${CWV_SEARCH})).\n`;
  md += `- **INP:** no laboratório sem interação real, o **TBT** (Total Blocking Time) é um **proxy** para possíveis problemas de interatividade ([documentação](${WEB_VITALS})).\n`;
  md += `- **Acessibilidade:** regras automáticas (Lighthouse + axe) cobrem **parte** dos critérios [WCAG 2.1](${WCAG}); revisão manual continua necessária para conformidade plena.\n\n`;

  md += cruxIntroMarkdown();

  md += `## Resumo por URL — apenas Lighthouse (laboratório)\n\n`;
  md += `_Não confundir com a tabela CrUX acima em cada URL (dados de campo)._\n\n`;
  md += `| URL | Perfil | Perf (0–1) | A11y (0–1) | LCP | CLS | TBT | Notas LCP/CLS/TBT (lab) |\n`;
  md += `|-----|--------|------------|------------|-----|-----|-----|-------------------------|\n`;

  for (const r of results) {
    const addRow = (
      profile: string,
      perf: number | null,
      a11y: number | null,
      lcp: number | null,
      cls: number | null,
      tbt: number | null
    ) => {
      const { lcp: rl, cls: rc, tbt: rt } = vitalsRating(lcp, cls, tbt);
      md += `| ${r.url} | ${profile} | ${fmtScore(perf)} | ${fmtScore(a11y)} | ${fmtMs(lcp)} | ${fmtScore(cls)} | ${fmtMs(tbt)} | LCP: ${rl}; CLS: ${rc}; TBT: ${rt} |\n`;
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
      md += `| ${r.url} | mobile | — | — | — | — | — | Erro: ${r.lighthouseMobile.error ?? "?"} |\n`;
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
      md += `| ${r.url} | desktop | — | — | — | — | — | Erro: ${r.lighthouseDesktop.error ?? "?"} |\n`;
    }
  }

  md += `\n## Detalhes por URL\n\n`;

  for (const r of results) {
    md += `### ${r.url}\n\n`;
    md += cruxBlockMarkdown(r);
    if (r.playwrightError) {
      md += `**Aviso Playwright:** ${r.playwrightError}\n\n`;
    }

    md += `#### Acessibilidade (axe — WCAG 2.0/2.1 A e AA)\n\n`;
    if (!r.axe.ok && r.axe.error) {
      md += `Erro na análise axe: ${r.axe.error}\n\n`;
    } else {
      md += `- **Violações:** ${r.axe.violations.length}\n`;
      if (r.axe.violations.length === 0) {
        md += `- Nenhuma violação detectada pelas regras axe executadas (não garante conformidade total).\n\n`;
      } else {
        for (const v of r.axe.violations) {
          md += `\n- **${v.id}** (${v.impact ?? "impacto ?"})\n`;
          md += `  - ${v.help}\n`;
          md += `  - Nós afetados: ${v.nodes} | [Detalhes](${v.helpUrl})\n`;
          md += `  - **Ação sugerida:** corrigir conforme o guia do axe/WCAG; validar com leitores de tela e teclado.\n`;
        }
        md += `\n`;
      }
      if (r.axe.incomplete.length > 0) {
        md += `\n**Itens incompletos (requerem checagem manual):** ${r.axe.incomplete.length}\n`;
        for (const i of r.axe.incomplete.slice(0, 15)) {
          md += `- ${i.id}: ${i.help}\n`;
        }
        if (r.axe.incomplete.length > 15) md += `- ... e mais ${r.axe.incomplete.length - 15}\n`;
        md += `\n`;
      }
    }

    const lhSection = (label: string, lh: LighthouseSummary) => {
      if (!lh) return;
      md += `#### Lighthouse — ${label} (laboratório local)\n\n`;
      if (!lh.ok) {
        md += `Erro: ${lh.error}\n\n`;
        return;
      }
      md += `| Métrica | Valor |\n|---------|-------|\n`;
      md += `| Performance score | ${fmtScore(lh.performanceScore)} |\n`;
      md += `| Acessibilidade score | ${fmtScore(lh.accessibilityScore)} |\n`;
      md += `| LCP | ${fmtMs(lh.lcpMs)} |\n`;
      md += `| CLS | ${fmtScore(lh.cls)} |\n`;
      md += `| TBT | ${fmtMs(lh.tbtMs)} |\n`;
      md += `| FCP | ${fmtMs(lh.fcpMs)} |\n`;
      md += `| Speed Index | ${fmtMs(lh.speedIndex)} |\n\n`;

      if (lh.failedPerformanceAudits.length > 0) {
        md += `**Auditorias de performance com oportunidade de melhoria:**\n\n`;
        for (const a of lh.failedPerformanceAudits.slice(0, 25)) {
          md += `- **${a.title}** (\`${a.id}\`)\n`;
          const short = a.description.replace(/\s+/g, " ").slice(0, 320);
          md += `  - ${short}${a.description.length > 320 ? "…" : ""}\n`;
        }
        if (lh.failedPerformanceAudits.length > 25) {
          md += `\n*… e mais ${lh.failedPerformanceAudits.length - 25} auditorias.*\n`;
        }
        md += `\n`;
      }

      if (lh.failedAccessibilityAudits.length > 0) {
        md += `**Auditorias de acessibilidade (Lighthouse) com melhoria possível:**\n\n`;
        for (const a of lh.failedAccessibilityAudits.slice(0, 20)) {
          md += `- **${a.title}** (\`${a.id}\`)\n`;
          const short = a.description.replace(/\s+/g, " ").slice(0, 280);
          md += `  - ${short}${a.description.length > 280 ? "…" : ""}\n`;
        }
        md += `\n`;
      }
    };

    if (r.lighthouseMobile) lhSection("Mobile", r.lighthouseMobile);
    if (r.lighthouseDesktop) lhSection("Desktop", r.lighthouseDesktop);

    md += `\n---\n\n`;
  }

  md += qualitativeAdsSection(options.docMappingPath);

  md += `\n## Referências\n\n`;
  md += `- [Web Vitals](${WEB_VITALS})\n`;
  md += `- [Core Web Vitals e Google Search](${CWV_SEARCH})\n`;
  md += `- [WCAG 2.1](${WCAG})\n`;
  md += `- [Otimizar LCP](${OPT_LCP}) · [Otimizar CLS](${OPT_CLS}) · [Otimizar INP](${OPT_INP})\n`;

  return md;
}

export function defaultDocMappingPath(projectRootDir: string): string {
  return join(projectRootDir, "doc_ mapeamentoADS", "Mapeamento ADS ReclameAQUI.txt");
}
