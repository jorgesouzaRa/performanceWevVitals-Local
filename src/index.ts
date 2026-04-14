import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Sempre `<repo>/.env`, independentemente do cwd (ex.: `npm run` noutra pasta). */
loadEnv({ path: join(__dirname, "..", ".env") });

import {
  applyGreenSubdomainToUrl,
  expandTargetUrls,
  loadConfig,
  loadExplicitAuditUrls,
  projectRoot,
} from "./config.js";
import type { AuditConfig } from "./config.js";
import { buildPagespeedApiHtmlReport } from "./pagespeed-api-only/html-report.js";
import { runPagespeedApiOnlyPipeline } from "./pagespeed-api-only/pipeline.js";
import { validateAuditUrl } from "./pagespeed-api-only/validate-url.js";
import {
  buildExecutiveMarkdown,
  writeConsolidatedJson,
} from "./pagespeed-api-only/write-reports.js";
import { openHtmlReport } from "./open-report.js";
import {
  AuditProgressReporter,
  countAuditSteps,
  countPagespeedApiOnlySteps,
} from "./progress.js";
import { buildHtmlReport } from "./report/html.js";
import { buildMarkdownReport, defaultDocMappingPath } from "./report/markdown.js";
import { runAllAudits, writeReportFile } from "./runner.js";

function effectivePagespeedApiOnlyMode(cfg: AuditConfig): boolean {
  if (process.argv.includes("--pagespeed-api-only")) return true;
  const env = (process.env.ANALYSIS_MODE ?? "").trim();
  if (env === "pagespeed_api_only") return true;
  return cfg.analysisMode === "pagespeed_api_only";
}

function wantsGreenAudit(): boolean {
  return (
    process.argv.includes("--green") ||
    process.env.AUDIT_GREEN === "1" ||
    process.env.AUDIT_GREEN?.toLowerCase() === "true"
  );
}

async function main() {
  const cfg = loadConfig();
  const explicitUrls = loadExplicitAuditUrls(cfg);
  let urls = explicitUrls ?? expandTargetUrls(cfg);
  if (explicitUrls) {
    console.log(
      'URLs: usando lista explícita em config/audit-urls.json (staticPaths e companySlugs em urls.json são ignorados para a lista).'
    );
  }
  const greenMode = wantsGreenAudit();
  if (greenMode) {
    urls = urls.map((u) => applyGreenSubdomainToUrl(u));
    console.log(
      "Modo green: todas as URLs usam o subdomínio green.* (ex.: https://green.reclameaqui.com.br/…)."
    );
  }
  const lim = process.env.AUDIT_URL_LIMIT;
  if (lim) {
    const n = parseInt(lim, 10);
    if (!Number.isNaN(n) && n > 0) urls = urls.slice(0, n);
  }
  if (urls.length === 0) {
    console.error(
      "Nenhuma URL para auditar. Edite config/audit-urls.json (array \"urls\") ou config/urls.json (staticPaths e companySlugs)."
    );
    process.exit(1);
  }

  const apiKey = process.env.PAGESPEED_API_KEY?.trim();

  if (effectivePagespeedApiOnlyMode(cfg)) {
    if (cfg.browserAuth) {
      console.warn(
        "[auth] browserAuth é ignorado no modo pagespeed_api_only — o Google não usa a tua sessão. Use o modo legacy (npm run audit) para testes com login."
      );
    }
    if (!apiKey) {
      console.error(
        "Modo pagespeed_api_only: defina PAGESPEED_API_KEY (PageSpeed Insights API v5, Google Cloud)."
      );
      process.exit(1);
    }
    for (const u of urls) {
      const err = validateAuditUrl(u);
      if (err) {
        console.error(`URL inválida (${u}): ${err}`);
        process.exit(1);
      }
    }
    console.log(
      "Modo pagespeed_api_only: apenas API oficial runPagespeed (mobile+desktop por URL), sem Playwright/Lighthouse local."
    );
    const totalSteps = countPagespeedApiOnlySteps(urls.length);
    const progress = new AuditProgressReporter();
    progress.start(totalSteps);
    const report = await runPagespeedApiOnlyPipeline(urls, cfg, {
      apiKey,
      hooks: {
        onPhaseStart: (label) => progress.setPhase(label),
        onPhaseEnd: () => progress.completeStep(),
      },
    }).catch((e) => {
      progress.fail(e instanceof Error ? e.message : String(e));
      throw e;
    });
    progress.finish("A gravar relatórios…");
    const stamp = new Date().toISOString().slice(0, 10);
    const jsonPath = writeConsolidatedJson(report, `pagespeed-api-consolidated-${stamp}.json`);
    const md = buildExecutiveMarkdown(report);
    const mdPath = writeReportFile(`pagespeed-api-executive-${stamp}.md`, md);
    const html = buildPagespeedApiHtmlReport(report);
    const htmlPath = writeReportFile(`pagespeed-api-report-${stamp}.html`, html);
    console.log(`JSON consolidado: ${jsonPath}`);
    console.log(`Markdown executivo: ${mdPath}`);
    console.log(`HTML:              ${htmlPath}`);
    openHtmlReport(htmlPath);
    if (process.env.SKIP_OPEN_HTML !== "1" && process.env.CI !== "true") {
      console.log("Abrindo o relatório HTML no navegador…");
    }
    return;
  }

  const requirePageSpeedApi =
    process.env.REQUIRE_PAGESPEED_API === "1" ||
    process.env.REQUIRE_PAGESPEED_API?.toLowerCase() === "true";

  if (requirePageSpeedApi && !apiKey) {
    console.error(
      "audit-PageSpeedAPI: defina PAGESPEED_API_KEY no .env ou no ambiente (PageSpeed Insights API ativa na Google Cloud)."
    );
    process.exit(1);
  }

  let fetchCrux = false;
  let cruxSkipReason = "CrUX não configurado.";
  if (requirePageSpeedApi) {
    fetchCrux = true;
    cruxSkipReason = "";
  } else if (!cfg.pagespeedInsights.enabled) {
    cruxSkipReason =
      "pagespeedInsights.enabled está false em config — dados de campo desativados.";
  } else if (!apiKey) {
    cruxSkipReason =
      "Defina PAGESPEED_API_KEY (Google Cloud → ativar PageSpeed Insights API) para métricas como no PSI (utilizadores reais).";
    console.error(
      "\n\x1b[33mAviso:\x1b[0m sem PAGESPEED_API_KEY o relatório só mostra Lighthouse em laboratório (valores costumam ser muito piores que o CrUX no PageSpeed Insights).\n"
    );
  } else {
    fetchCrux = true;
  }

  const totalSteps = countAuditSteps(
    urls.length,
    cfg.lighthouse.runMobile,
    cfg.lighthouse.runDesktop,
    fetchCrux
  );

  const progress = new AuditProgressReporter();
  progress.start(totalSteps);

  const results = await runAllAudits(urls, cfg, {
    onPhaseStart: (label) => progress.setPhase(label),
    onPhaseEnd: () => progress.completeStep(),
  }, {
    fetchCruxField: fetchCrux,
    pagespeedApiKey: apiKey,
    cruxSkipReason,
  }).catch((e) => {
    progress.fail(e instanceof Error ? e.message : String(e));
    throw e;
  });

  progress.finish("Gerando relatórios…");

  const root = projectRoot();
  const docPath = defaultDocMappingPath(root);
  const stamp = new Date().toISOString().slice(0, 10);

  const md = buildMarkdownReport(results, { docMappingPath: docPath });
  const mdPath = writeReportFile(`relatorio-${stamp}.md`, md);

  const html = buildHtmlReport(results, { docMappingPath: docPath });
  const htmlPath = writeReportFile(`relatorio-${stamp}.html`, html);

  console.log(`Relatório Markdown: ${mdPath}`);
  console.log(`Relatório HTML:     ${htmlPath}`);

  if (process.env.PRINT_MD === "1") {
    console.log("\n--- Markdown ---\n");
    console.log(md);
  }

  openHtmlReport(htmlPath);
  if (process.env.SKIP_OPEN_HTML !== "1" && process.env.CI !== "true") {
    console.log("Abrindo o relatório HTML no navegador…");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
