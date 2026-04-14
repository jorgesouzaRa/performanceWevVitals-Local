import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import type { AuditConfig, BrowserAuthConfig } from "./config.js";
import { projectRoot } from "./config.js";

export type BrowserAuthResolved = {
  /** Caminho absoluto do ficheiro de estado, se existir ou tiver sido criado. */
  storageStatePathAbs?: string;
  /** Cabeçalho Cookie para o Lighthouse (mesmo domínio da URL auditada). */
  cookieHeaderForTargetUrl: (url: string) => string | undefined;
};

type StorageStateJson = {
  cookies?: {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure?: boolean;
    httpOnly?: boolean;
  }[];
};

function resolvePath(root: string, p: string | undefined, fallback: string): string {
  const rel = p?.trim() || fallback;
  return rel.startsWith("/") ? rel : join(root, rel);
}

/** Domínio do cookie: host deve coincidir ou ser subdomínio de domain (com ou sem ponto inicial). */
function cookieMatchesHost(cookieDomain: string, hostname: string): boolean {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  const h = hostname.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

function cookieMatchesPath(cookiePath: string, pathname: string): boolean {
  const p = cookiePath || "/";
  return pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`);
}

/**
 * Monta o header `Cookie` com os cookies do storage state aplicáveis ao URL.
 */
export function buildCookieHeaderForUrl(
  storageState: StorageStateJson,
  targetUrl: string
): string | undefined {
  const cookies = storageState.cookies;
  if (!cookies?.length) return undefined;
  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    return undefined;
  }
  const host = u.hostname;
  const path = u.pathname || "/";
  const isHttps = u.protocol === "https:";
  const parts: string[] = [];
  for (const c of cookies) {
    if (!cookieMatchesHost(c.domain, host)) continue;
    if (!cookieMatchesPath(c.path || "/", path)) continue;
    if (c.secure && !isHttps) continue;
    parts.push(`${c.name}=${c.value}`);
  }
  if (parts.length === 0) return undefined;
  return parts.join("; ");
}

function loadStorageStateFromDisk(absPath: string): StorageStateJson | null {
  if (!existsSync(absPath)) return null;
  try {
    const raw = readFileSync(absPath, "utf-8");
    return JSON.parse(raw) as StorageStateJson;
  } catch {
    return null;
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

async function runLoginAndSaveState(
  cfg: AuditConfig,
  auth: BrowserAuthConfig,
  absPath: string,
  headless: boolean
): Promise<void> {
  const login = auth.login;
  if (!login) return;
  const email = process.env.AUDIT_LOGIN_EMAIL?.trim();
  const password = process.env.AUDIT_LOGIN_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "browserAuth.login: defina AUDIT_LOGIN_EMAIL e AUDIT_LOGIN_PASSWORD no .env (credenciais não vão no JSON)."
    );
  }

  mkdirSync(dirname(absPath), { recursive: true });
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(cfg.navigationTimeoutMs);

  try {
    await page.goto(login.url, { waitUntil: "domcontentloaded" });
    await tryDismissCookieBanners(page, cfg.cookieConsentSelectors);
    await page.locator(login.emailSelector).first().waitFor({
      state: "visible",
      timeout: cfg.navigationTimeoutMs,
    });
    await page.locator(login.emailSelector).first().fill(email);
    await page.locator(login.passwordSelector).first().fill(password);
    await page.locator(login.submitSelector).first().click();

    if (login.successSelector) {
      await page.waitForSelector(login.successSelector, {
        state: "visible",
        timeout: cfg.navigationTimeoutMs,
      });
    } else {
      await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
    }
    const waitExtra = login.postLoginWaitMs ?? 2000;
    await new Promise((r) => setTimeout(r, waitExtra));

    await context.storageState({ path: absPath });
  } finally {
    await browser.close();
  }
}

/**
 * Garante ficheiro de estado (login se configurado) e função para cookies no Lighthouse.
 * Só relevante para o modo legacy (Playwright + Lighthouse local).
 */
export async function ensureBrowserAuthState(
  cfg: AuditConfig,
  options: { forceLogin?: boolean } = {}
): Promise<BrowserAuthResolved> {
  const empty = (): BrowserAuthResolved => ({
    cookieHeaderForTargetUrl: () => undefined,
  });

  const auth = cfg.browserAuth;
  if (!auth?.login && !auth?.storageStatePath) {
    return empty();
  }

  const root = projectRoot();
  const defaultFile = "config/.auth/storage-state.json";
  const absPath = resolvePath(
    root,
    auth?.storageStatePath,
    defaultFile
  );

  const force =
    options.forceLogin === true ||
    process.env.AUDIT_LOGIN_FORCE === "1" ||
    process.env.AUDIT_LOGIN_FORCE?.toLowerCase() === "true";

  const headless =
    process.env.AUTH_HEADED !== "1" && process.env.AUTH_HEADED?.toLowerCase() !== "true";

  if (auth?.login) {
    const hasFile = existsSync(absPath);
    if (!hasFile || force) {
      console.log(
        force && hasFile
          ? "[auth] AUDIT_LOGIN_FORCE=1 — a executar login e a atualizar storage state…"
          : "[auth] A executar login e a gravar storage state…"
      );
      await runLoginAndSaveState(cfg, auth, absPath, headless);
      console.log(`[auth] Estado gravado em ${absPath}`);
    } else {
      console.log(`[auth] A usar storage state existente: ${absPath} (defina AUDIT_LOGIN_FORCE=1 para voltar a logar)`);
    }
  } else if (auth?.storageStatePath && !existsSync(absPath)) {
    console.warn(
      `[auth] Ficheiro não encontrado: ${absPath} — audits sem sessão. Configure browserAuth.login ou crie o ficheiro manualmente.`
    );
    return empty();
  }

  if (!existsSync(absPath)) {
    return empty();
  }

  const cached = loadStorageStateFromDisk(absPath);
  const cookieHeaderForTargetUrl = (url: string) => {
    if (!cached) return undefined;
    return buildCookieHeaderForUrl(cached, url);
  };

  return {
    storageStatePathAbs: absPath,
    cookieHeaderForTargetUrl,
  };
}
