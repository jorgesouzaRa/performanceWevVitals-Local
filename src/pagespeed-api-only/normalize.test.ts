import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeProfileFromApiJson } from "./normalize.js";

describe("normalizeProfileFromApiJson", () => {
  it("extrai categorias e métricas principais do lighthouseResult", () => {
    const json = {
      lighthouseResult: {
        requestedUrl: "https://example.com/",
        finalUrl: "https://example.com/",
        lighthouseVersion: "12.0.0",
        fetchTime: "2024-01-01T00:00:00.000Z",
        categories: {
          performance: { id: "performance", title: "Performance", score: 0.9 },
          accessibility: { id: "accessibility", title: "Acessibilidade", score: 0.85 },
          "best-practices": { id: "best-practices", title: "Best", score: 0.8 },
          seo: { id: "seo", title: "SEO", score: 0.95 },
        },
        audits: {
          "first-contentful-paint": {
            id: "first-contentful-paint",
            title: "FCP",
            score: 1,
            numericValue: 1200,
            displayValue: "1,2 s",
          },
          "largest-contentful-paint": {
            id: "largest-contentful-paint",
            title: "LCP",
            score: 0.5,
            numericValue: 3200,
            displayValue: "3,2 s",
          },
          "cumulative-layout-shift": {
            id: "cumulative-layout-shift",
            title: "CLS",
            score: 1,
            numericValue: 0.05,
            displayValue: "0,05",
          },
          "total-blocking-time": {
            id: "total-blocking-time",
            title: "TBT",
            score: 0.7,
            numericValue: 400,
            displayValue: "400 ms",
          },
        },
      },
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2800, category: "FAST" },
        },
        overall_category: "FAST",
      },
    };

    const p = normalizeProfileFromApiJson(json as never, "mobile");
    assert.equal(p.meta.requestedUrl, "https://example.com/");
    assert.equal(p.metrics.lcp?.numericValue, 3200);
    assert.equal(p.fieldData.available, true);
    assert.equal(p.categories.length >= 4, true);
  });
});
