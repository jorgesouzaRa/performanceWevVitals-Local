import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

export type AuditConfig = {
  baseUrl: string;
  companySlugs: string[];
  staticPaths: string[];
  cookieConsentSelectors: string[];
  navigationTimeoutMs: number;
  /** Se true (padrão) e existir PAGESPEED_API_KEY, obtém CrUX (campo) como no PageSpeed Insights. */
  pagespeedInsights: {
    enabled: boolean;
  };
  lighthouse: {
    runMobile: boolean;
    runDesktop: boolean;
    /** Laboratório local: `devtools-lite` reduz throttling (continua diferente de CrUX). */
    labThrottling: "default" | "devtools-lite";
  };
};

export function loadConfig(): AuditConfig {
  const customPath = join(PROJECT_ROOT, "config", "urls.json");
  const examplePath = join(PROJECT_ROOT, "config", "urls.example.json");
  const path = existsSync(customPath) ? customPath : examplePath;
  const raw = JSON.parse(readFileSync(path, "utf-8")) as AuditConfig;
  if (!raw.baseUrl || typeof raw.baseUrl !== "string") {
    throw new Error("config: baseUrl é obrigatório");
  }
  return {
    baseUrl: raw.baseUrl.replace(/\/$/, ""),
    companySlugs: Array.isArray(raw.companySlugs) ? raw.companySlugs : [],
    staticPaths: Array.isArray(raw.staticPaths) ? raw.staticPaths : [],
    cookieConsentSelectors: Array.isArray(raw.cookieConsentSelectors)
      ? raw.cookieConsentSelectors
      : [],
    navigationTimeoutMs: raw.navigationTimeoutMs ?? 45000,
    pagespeedInsights: {
      enabled: raw.pagespeedInsights?.enabled !== false,
    },
    lighthouse: {
      runMobile: raw.lighthouse?.runMobile !== false,
      runDesktop: raw.lighthouse?.runDesktop !== false,
      labThrottling:
        raw.lighthouse?.labThrottling === "devtools-lite"
          ? "devtools-lite"
          : "default",
    },
  };
}

export function expandTargetUrls(cfg: AuditConfig): string[] {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const out: string[] = [];

  const push = (u: string) => {
    if (!out.includes(u)) out.push(u);
  };

  for (const p of cfg.staticPaths) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed)) {
      push(trimmed.replace(/\/$/, "") === trimmed ? trimmed : trimmed.replace(/\/$/, ""));
      continue;
    }
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    push(`${base}${path}`);
  }

  for (const slug of cfg.companySlugs) {
    const s = String(slug).replace(/^\/+|\/+$/g, "");
    if (!s) continue;
    push(`${base}/empresa/${s}`);
    push(`${base}/empresa/${s}/sobre`);
    push(`${base}/empresa/${s}/leitura-de-reclamacao`);
  }

  return out;
}

export function projectRoot(): string {
  return PROJECT_ROOT;
}
