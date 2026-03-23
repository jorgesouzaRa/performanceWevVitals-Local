import { expandTargetUrls, loadConfig, projectRoot } from "./config.js";
import { openHtmlReport } from "./open-report.js";
import { AuditProgressReporter, countAuditSteps } from "./progress.js";
import { buildHtmlReport } from "./report/html.js";
import { buildMarkdownReport, defaultDocMappingPath } from "./report/markdown.js";
import { runAllAudits, writeReportFile } from "./runner.js";

async function main() {
  const cfg = loadConfig();
  let urls = expandTargetUrls(cfg);
  const lim = process.env.AUDIT_URL_LIMIT;
  if (lim) {
    const n = parseInt(lim, 10);
    if (!Number.isNaN(n) && n > 0) urls = urls.slice(0, n);
  }
  if (urls.length === 0) {
    console.error("Nenhuma URL para auditar. Configure staticPaths e/ou companySlugs em config/urls.json.");
    process.exit(1);
  }

  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  let fetchCrux = false;
  let cruxSkipReason = "CrUX não configurado.";
  if (!cfg.pagespeedInsights.enabled) {
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
