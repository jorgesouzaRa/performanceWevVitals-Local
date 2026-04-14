import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExecutiveSummary } from "./summary-rules.js";
import type { ProfileNorm } from "./types.js";

function minimalProfile(strategy: "mobile" | "desktop"): ProfileNorm {
  return {
    strategy,
    source: "pagespeed_insights_api_v5",
    status: { kind: "ok" },
    meta: {
      finalUrl: "https://example.com/",
      requestedUrl: "https://example.com/",
      lighthouseVersion: "12",
      fetchTime: null,
      userAgent: null,
      environment: null,
      runtimeError: null,
      analysisTimestamp: null,
    },
    categories: [
      {
        id: "performance",
        title: "Perf",
        score01: 0.3,
        score100: 30,
        status: "api",
      },
      {
        id: "accessibility",
        title: "A11y",
        score01: 0.95,
        score100: 95,
        status: "api",
      },
      {
        id: "seo",
        title: "SEO",
        score01: 0.92,
        score100: 92,
        status: "api",
      },
    ],
    metrics: {
      lcp: {
        key: "lcp",
        auditId: "largest-contentful-paint",
        numericValue: 5000,
        displayValue: "5 s",
        unit: "ms",
        score01: 0.2,
        provenance: "api",
      },
      cls: {
        key: "cls",
        auditId: "cumulative-layout-shift",
        numericValue: 0.05,
        displayValue: "0.05",
        unit: "unitless",
        score01: 1,
        provenance: "api",
      },
      tbt: {
        key: "tbt",
        auditId: "total-blocking-time",
        numericValue: 900,
        displayValue: "900 ms",
        unit: "ms",
        score01: 0.4,
        provenance: "api",
      },
    },
    fieldData: {
      available: false,
      scope: null,
      loadingExperience: null,
      originLoadingExperience: null,
      metricsNormalized: [],
      notes: [],
    },
    auditsAll: [],
    opportunities: [],
    diagnostics: [],
    screenshots: {
      fullPageDataUrl: null,
      thumbnailDataUrl: null,
      sourceAuditIds: [],
    },
    stackPacks: null,
    entities: null,
    runWarnings: null,
  };
}

describe("buildExecutiveSummary", () => {
  it("marca LCP ruim e performance crítica", () => {
    const m = minimalProfile("mobile");
    const d = minimalProfile("desktop");
    d.metrics.lcp = { ...d.metrics.lcp!, numericValue: 5000 };
    const s = buildExecutiveSummary(m, d, "https://example.com/");
    assert.ok(s.bullets.some((b) => b.includes("LCP ruim") || b.includes("LCP")));
    assert.ok(s.worstProblems.some((w) => w.code === "lcp_bad"));
    assert.ok(s.bullets.some((b) => b.includes("crítica") || b.includes("crítico")));
  });
});
