import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import type { Result as LHResult } from "lighthouse";
import { chromium } from "playwright";

export type LighthouseFormFactor = "mobile" | "desktop";

/** `default` = throttling padrão Lighthouse (laboratório pesado). `devtools-lite` = rede/CPU mais leves (ainda laboratório, não é CrUX). */
export type LabThrottlingPreset = "default" | "devtools-lite";

export type LighthouseSummary = {
  formFactor: LighthouseFormFactor;
  ok: boolean;
  error?: string;
  performanceScore: number | null;
  accessibilityScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndex: number | null;
  failedPerformanceAudits: { id: string; title: string; description: string }[];
  failedAccessibilityAudits: { id: string; title: string; description: string }[];
  raw?: LHResult;
};

/** Throttling aplicado durante a navegação (devtools) — mais leve que mobileSlow4G. */
const DEVTOOLS_LITE = {
  mobile: {
    rttMs: 70,
    throughputKbps: 12 * 1024,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
    cpuSlowdownMultiplier: 2,
  },
  desktop: {
    rttMs: 40,
    throughputKbps: 25 * 1024,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
    cpuSlowdownMultiplier: 1,
  },
};

function auditNumeric(lhr: LHResult, id: string): number | null {
  const a = lhr.audits[id];
  if (!a || a.numericValue === undefined) return null;
  return a.numericValue;
}

function collectFailedAudits(
  lhr: LHResult,
  categoryId: "performance" | "accessibility"
): { id: string; title: string; description: string }[] {
  const cat = lhr.categories[categoryId];
  if (!cat?.auditRefs) return [];
  const out: { id: string; title: string; description: string }[] = [];
  for (const ref of cat.auditRefs) {
    const audit = lhr.audits[ref.id];
    if (!audit) continue;
    if (audit.score === null) continue;
    if (audit.score < 1) {
      out.push({
        id: ref.id,
        title: audit.title,
        description: audit.description,
      });
    }
  }
  return out;
}

export async function runLighthouseAudit(
  url: string,
  formFactor: LighthouseFormFactor,
  labThrottling: LabThrottlingPreset = "default"
): Promise<LighthouseSummary> {
  const chromePath =
    process.env.CHROME_PATH?.trim() || chromium.executablePath();
  const chrome = await launch({
    chromePath,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  try {
    const flags: Parameters<typeof lighthouse>[1] = {
      port: chrome.port,
      logLevel: "silent",
      output: "json",
      onlyCategories: ["performance", "accessibility"],
      locale: "pt",
    };

    if (formFactor === "desktop") {
      flags.formFactor = "desktop";
      flags.screenEmulation = { disabled: true };
    } else {
      flags.formFactor = "mobile";
    }

    if (labThrottling === "devtools-lite") {
      flags.throttlingMethod = "devtools";
      flags.throttling =
        formFactor === "mobile"
          ? DEVTOOLS_LITE.mobile
          : DEVTOOLS_LITE.desktop;
    }

    const runnerResult = await lighthouse(url, flags);
    const lhr = runnerResult?.lhr;
    if (!lhr) {
      return {
        formFactor,
        ok: false,
        error: "Lighthouse não retornou resultado",
        performanceScore: null,
        accessibilityScore: null,
        lcpMs: null,
        cls: null,
        tbtMs: null,
        fcpMs: null,
        speedIndex: null,
        failedPerformanceAudits: [],
        failedAccessibilityAudits: [],
      };
    }

    return {
      formFactor,
      ok: true,
      performanceScore: lhr.categories.performance?.score ?? null,
      accessibilityScore: lhr.categories.accessibility?.score ?? null,
      lcpMs: auditNumeric(lhr, "largest-contentful-paint"),
      cls: auditNumeric(lhr, "cumulative-layout-shift"),
      tbtMs: auditNumeric(lhr, "total-blocking-time"),
      fcpMs: auditNumeric(lhr, "first-contentful-paint"),
      speedIndex: auditNumeric(lhr, "speed-index"),
      failedPerformanceAudits: collectFailedAudits(lhr, "performance"),
      failedAccessibilityAudits: collectFailedAudits(lhr, "accessibility"),
      raw: lhr,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      formFactor,
      ok: false,
      error: msg,
      performanceScore: null,
      accessibilityScore: null,
      lcpMs: null,
      cls: null,
      tbtMs: null,
      fcpMs: null,
      speedIndex: null,
      failedPerformanceAudits: [],
      failedAccessibilityAudits: [],
    };
  } finally {
    await chrome.kill();
  }
}
