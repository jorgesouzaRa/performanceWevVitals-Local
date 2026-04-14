import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

/** Modo `pagespeed_api_only`: só API oficial runPagespeed (sem Playwright/Lighthouse local). */
export type AnalysisMode = "legacy" | "pagespeed_api_only";

export type PagespeedApiOnlyConfig = {
  /** BCP 47 / locale da UI (parâmetro `locale` da API). */
  locale?: string;
  /** Categorias Lighthouse pedidas à API (padrão: as quatro principais). */
  categories?: string[];
  /** Timeout por requisição HTTP (ms). */
  timeoutMs?: number;
  retry?: {
    count: number;
    delayMs?: number;
    backoffMultiplier?: number;
  };
  /** Máximo de URLs em paralelo (cada URL faz mobile + desktop). */
  concurrency?: number;
  /** Gravar JSON bruto da API em disco (debug). */
  saveRawPayload?: boolean;
  /** Subpasta dentro de `reports/` para payloads brutos. */
  rawOutputSubdir?: string;
  /** Diretório de cache; `null` desativa. Relativo ao projeto se não for absoluto. */
  cacheDir?: string | null;
  /** Log extra no stderr. */
  verbose?: boolean;
};

/**
 * Sessão autenticada no browser (modo `legacy` apenas).
 * Credenciais nunca vão no JSON — use `AUDIT_LOGIN_EMAIL` e `AUDIT_LOGIN_PASSWORD` no `.env`.
 */
export type BrowserAuthConfig = {
  /** Onde gravar/carregar o estado (cookies, localStorage). Relativo ao projeto ou absoluto. */
  storageStatePath?: string;
  /** Login automático antes dos audits (grava `storageStatePath`). */
  login?: {
    url: string;
    emailSelector: string;
    passwordSelector: string;
    submitSelector: string;
    /** Opcional: esperar este elemento após enviar o formulário. */
    successSelector?: string;
    /** Espera extra após login (ms). */
    postLoginWaitMs?: number;
  };
};

export type AuditConfig = {
  baseUrl: string;
  companySlugs: string[];
  staticPaths: string[];
  cookieConsentSelectors: string[];
  navigationTimeoutMs: number;
  /** Playwright: estado de sessão + login opcional (só modo legacy). */
  browserAuth?: BrowserAuthConfig;
  /**
   * `legacy` (padrão): Playwright + axe + Lighthouse local + CrUX opcional.
   * `pagespeed_api_only`: apenas PageSpeed Insights API v5 (`runPagespeed`), mobile+desktop.
   */
  analysisMode?: AnalysisMode;
  /** Opções do modo `pagespeed_api_only`. */
  pagespeedApiOnly?: PagespeedApiOnlyConfig;
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
  const mode: AnalysisMode =
    raw.analysisMode === "pagespeed_api_only" ? "pagespeed_api_only" : "legacy";
  const pao = raw.pagespeedApiOnly;
  const ba = raw.browserAuth;
  return {
    baseUrl: raw.baseUrl.replace(/\/$/, ""),
    companySlugs: Array.isArray(raw.companySlugs) ? raw.companySlugs : [],
    staticPaths: Array.isArray(raw.staticPaths) ? raw.staticPaths : [],
    cookieConsentSelectors: Array.isArray(raw.cookieConsentSelectors)
      ? raw.cookieConsentSelectors
      : [],
    navigationTimeoutMs: raw.navigationTimeoutMs ?? 45000,
    browserAuth: ba
      ? {
          storageStatePath:
            typeof ba.storageStatePath === "string"
              ? ba.storageStatePath
              : undefined,
          login:
            ba.login &&
            typeof ba.login.url === "string" &&
            typeof ba.login.emailSelector === "string" &&
            typeof ba.login.passwordSelector === "string" &&
            typeof ba.login.submitSelector === "string"
              ? {
                  url: ba.login.url,
                  emailSelector: ba.login.emailSelector,
                  passwordSelector: ba.login.passwordSelector,
                  submitSelector: ba.login.submitSelector,
                  successSelector:
                    typeof ba.login.successSelector === "string"
                      ? ba.login.successSelector
                      : undefined,
                  postLoginWaitMs:
                    typeof ba.login.postLoginWaitMs === "number"
                      ? ba.login.postLoginWaitMs
                      : undefined,
                }
              : undefined,
        }
      : undefined,
    analysisMode: mode,
    pagespeedApiOnly: pao
      ? {
          locale: typeof pao.locale === "string" ? pao.locale : undefined,
          categories: Array.isArray(pao.categories)
            ? pao.categories.map(String)
            : undefined,
          timeoutMs:
            typeof pao.timeoutMs === "number" && pao.timeoutMs > 0
              ? pao.timeoutMs
              : undefined,
          retry:
            pao.retry && typeof pao.retry.count === "number"
              ? {
                  count: Math.max(0, Math.floor(pao.retry.count)),
                  delayMs:
                    typeof pao.retry.delayMs === "number"
                      ? pao.retry.delayMs
                      : undefined,
                  backoffMultiplier:
                    typeof pao.retry.backoffMultiplier === "number"
                      ? pao.retry.backoffMultiplier
                      : undefined,
                }
              : undefined,
          concurrency:
            typeof pao.concurrency === "number" && pao.concurrency > 0
              ? Math.floor(pao.concurrency)
              : undefined,
          saveRawPayload: pao.saveRawPayload === true,
          rawOutputSubdir:
            typeof pao.rawOutputSubdir === "string"
              ? pao.rawOutputSubdir
              : undefined,
          cacheDir:
            pao.cacheDir === null
              ? null
              : typeof pao.cacheDir === "string"
                ? pao.cacheDir
                : undefined,
          verbose: pao.verbose === true,
        }
      : undefined,
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

export function isAnalysisModePagespeedApiOnly(cfg: AuditConfig): boolean {
  return cfg.analysisMode === "pagespeed_api_only";
}

/** Config efetiva do modo API-only com defaults. */
export function resolvePagespeedApiOnlyOptions(
  cfg: AuditConfig
): Required<
  Pick<
    PagespeedApiOnlyConfig,
    "categories" | "timeoutMs" | "concurrency" | "saveRawPayload" | "verbose"
  >
> &
  PagespeedApiOnlyConfig {
  const d = cfg.pagespeedApiOnly ?? {};
  const categories =
    d.categories?.length && d.categories.length > 0
      ? d.categories
      : (["performance", "accessibility", "best-practices", "seo"] as const).slice();
  return {
    locale: d.locale,
    categories,
    timeoutMs: d.timeoutMs ?? 120_000,
    retry: d.retry,
    concurrency: d.concurrency ?? 2,
    saveRawPayload: d.saveRawPayload ?? false,
    rawOutputSubdir: d.rawOutputSubdir ?? "pagespeed-api-raw",
    cacheDir: d.cacheDir === null ? null : (d.cacheDir ?? ".cache/pagespeed-api"),
    verbose: d.verbose ?? false,
  };
}

/**
 * Mesma regra que `staticPaths`: URL absoluta ou caminho relativo ao `baseUrl` (ex.: `/compare`).
 */
export function resolveUrlPattern(trimmed: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

/**
 * Se existir `config/audit-urls.json` com pelo menos uma entrada em `urls`, devolve só essa lista
 * (ignora `staticPaths` e `companySlugs` de `urls.json`). Caso contrário devolve `null` para usar
 * {@link expandTargetUrls}.
 */
export function loadExplicitAuditUrls(cfg: AuditConfig): string[] | null {
  const path = join(PROJECT_ROOT, "config", "audit-urls.json");
  if (!existsSync(path)) return null;
  let raw: { urls?: unknown };
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as { urls?: unknown };
  } catch (e) {
    throw new Error(
      `config/audit-urls.json: JSON inválido — ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!Array.isArray(raw.urls)) {
    console.warn(
      "config/audit-urls.json: falta o array \"urls\" ou formato inválido; usando staticPaths/companySlugs de urls.json."
    );
    return null;
  }
  const base = cfg.baseUrl;
  const out: string[] = [];
  const push = (u: string) => {
    if (!out.includes(u)) out.push(u);
  };
  for (const item of raw.urls) {
    const trimmed = String(item).trim();
    if (!trimmed) continue;
    push(resolveUrlPattern(trimmed, base));
  }
  if (out.length === 0) {
    console.warn(
      'config/audit-urls.json: "urls" está vazio; usando staticPaths/companySlugs de urls.json.'
    );
    return null;
  }
  return out;
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
    push(resolveUrlPattern(trimmed, cfg.baseUrl));
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

/** Hosts locais ou IP — não alterar (modo green). */
function isNonDnsHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  if (hostname.startsWith("[")) return true;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

/**
 * Usa o subdomínio `green.` no host (ex.: `www.reclameaqui.com.br` → `green.reclameaqui.com.br`;
 * `blog.reclameaqui.com.br` → `green.blog.reclameaqui.com.br`). Idempotente se já for `green.*`.
 */
export function applyGreenSubdomainToUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname;
  if (isNonDnsHostname(host) || host.startsWith("green.")) {
    return url;
  }
  const newHost = host.startsWith("www.") ? `green.${host.slice(4)}` : `green.${host}`;
  u.hostname = newHost;
  return u.href;
}

export function projectRoot(): string {
  return PROJECT_ROOT;
}
