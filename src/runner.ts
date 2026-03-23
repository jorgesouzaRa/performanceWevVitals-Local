import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { AuditConfig } from "./config.js";
import { projectRoot as getRoot } from "./config.js";
import { runAxeOnPage } from "./axe-audit.js";
import { runLighthouseAudit } from "./lighthouse-audit.js";
import { fetchBothStrategies } from "./pagespeed-field.js";
import type { FieldFetchResult } from "./pagespeed-field.js";

export type UrlAuditResult = {
  url: string;
  playwrightError?: string;
  axe: Awaited<ReturnType<typeof runAxeOnPage>>;
  /** CrUX via PageSpeed Insights API (campo) — alinhado ao que o PSI mostra em “usuários reais”. */
  cruxField?:
    | { status: "skipped"; reason: string }
    | { status: "fetched"; mobile: FieldFetchResult; desktop: FieldFetchResult };
  lighthouseMobile?: Awaited<ReturnType<typeof runLighthouseAudit>>;
  lighthouseDesktop?: Awaited<ReturnType<typeof runLighthouseAudit>>;
};

export type AuditPhaseHooks = {
  onPhaseStart: (label: string) => void;
  onPhaseEnd: () => void;
};

export type RunAllAuditsOptions = {
  pagespeedApiKey?: string;
  /** Se true, chama a API do PSI para CrUX (mobile + desktop) por URL. */
  fetchCruxField: boolean;
  /** Mensagem quando fetchCruxField é false (ex.: falta de API key). */
  cruxSkipReason?: string;
};

function shortUrlForLabel(u: string): string {
  try {
    const x = new URL(u);
    const path = x.pathname + x.search;
    return path.length > 1 ? path.slice(0, 52) : x.host.slice(0, 52);
  } catch {
    return u.slice(0, 52);
  }
}

async function tryDismissCookieBanners(
  page: import("playwright").Page,
  selectors: string[]
): Promise<void> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: 2500 });
      await loc.click({ timeout: 2000 });
      await new Promise((r) => setTimeout(r, 800));
    } catch {
      /* ignore */
    }
  }
}

export async function auditUrl(
  url: string,
  cfg: AuditConfig,
  hooks?: AuditPhaseHooks,
  runOpts?: RunAllAuditsOptions
): Promise<UrlAuditResult> {
  const result: UrlAuditResult = {
    url,
    axe: { ok: false, violations: [], incomplete: [], error: "não executado" },
  };

  const su = shortUrlForLabel(url);
  const key = runOpts?.pagespeedApiKey?.trim();
  const fetchCrux = !!runOpts?.fetchCruxField && !!key;

  if (fetchCrux && key) {
    hooks?.onPhaseStart(`PageSpeed Insights (CrUX campo) — ${su}`);
    const { mobile, desktop } = await fetchBothStrategies(url, key);
    result.cruxField = { status: "fetched", mobile, desktop };
    hooks?.onPhaseEnd();
  } else {
    result.cruxField = {
      status: "skipped",
      reason:
        runOpts?.cruxSkipReason ??
        "Dados de campo não obtidos (config ou PAGESPEED_API_KEY).",
    };
  }

  hooks?.onPhaseStart(`Playwright + axe — ${su}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(cfg.navigationTimeoutMs);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: cfg.navigationTimeoutMs });
      await tryDismissCookieBanners(page, cfg.cookieConsentSelectors);
      await page.waitForLoadState("load", { timeout: 25000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
      result.axe = await runAxeOnPage(page);
    } catch (e) {
      result.playwrightError = e instanceof Error ? e.message : String(e);
      result.axe = await runAxeOnPage(page).catch(() => ({
        ok: false,
        error: String(e),
        violations: [],
        incomplete: [],
      }));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  hooks?.onPhaseEnd();

  const th = cfg.lighthouse.labThrottling;

  if (cfg.lighthouse.runMobile) {
    hooks?.onPhaseStart(`Lighthouse mobile (lab) — ${su}`);
    result.lighthouseMobile = await runLighthouseAudit(url, "mobile", th);
    hooks?.onPhaseEnd();
  }

  if (cfg.lighthouse.runDesktop) {
    hooks?.onPhaseStart(`Lighthouse desktop (lab) — ${su}`);
    result.lighthouseDesktop = await runLighthouseAudit(url, "desktop", th);
    hooks?.onPhaseEnd();
  }

  return result;
}

export async function runAllAudits(
  urls: string[],
  cfg: AuditConfig,
  hooks?: AuditPhaseHooks,
  runOpts?: RunAllAuditsOptions
): Promise<UrlAuditResult[]> {
  const out: UrlAuditResult[] = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    out.push(await auditUrl(u, cfg, hooks, runOpts));
    if (i < urls.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return out;
}

export function writeReportFile(filename: string, content: string): string {
  const root = getRoot();
  const dir = join(root, "reports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, content, "utf-8");
  return path;
}
