import type { PagespeedApiRawResponse } from "./types.js";

const DEFAULT_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type RunPagespeedParams = {
  url: string;
  key: string;
  strategy: "mobile" | "desktop";
  categories: string[];
  locale?: string;
  timeoutMs: number;
  retry?: {
    count: number;
    delayMs?: number;
    backoffMultiplier?: number;
  };
  verbose?: boolean;
};

export type RunPagespeedSuccess = {
  ok: true;
  status: number;
  json: PagespeedApiRawResponse;
};

export type RunPagespeedFailure = {
  ok: false;
  status: number;
  errorKind: "timeout" | "network" | "rate_limit" | "invalid_response" | "api_error" | "unknown";
  message: string;
  bodySnippet?: string;
  apiError?: { code?: number; message?: string };
};

export type RunPagespeedResult = RunPagespeedSuccess | RunPagespeedFailure;

function buildSearchParams(p: RunPagespeedParams): string {
  const u = new URL(DEFAULT_ENDPOINT);
  u.searchParams.set("url", p.url);
  u.searchParams.set("key", p.key);
  u.searchParams.set("strategy", p.strategy);
  for (const c of p.categories) {
    u.searchParams.append("category", c);
  }
  if (p.locale) u.searchParams.set("locale", p.locale);
  return u.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(headers: Headers): number | null {
  const ra = headers.get("Retry-After");
  if (!ra) return null;
  const n = parseInt(ra, 10);
  if (!Number.isNaN(n)) return n * 1000;
  return null;
}

export async function runPagespeed(
  params: RunPagespeedParams
): Promise<RunPagespeedResult> {
  const url = buildSearchParams(params);
  const maxAttempts = 1 + (params.retry?.count ?? 0);
  let attempt = 0;
  let delay = params.retry?.delayMs ?? 1500;
  const mult = params.retry?.backoffMultiplier ?? 2;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        return {
          ok: false,
          status: res.status,
          errorKind: "invalid_response",
          message: "Resposta não é JSON válido.",
          bodySnippet: text.slice(0, 400),
        };
      }

      const obj = json as Record<string, unknown>;

      if (res.status === 429) {
        const wait = parseRetryAfter(res.headers) ?? delay;
        if (params.verbose) {
          console.error(`[pagespeed-api] 429 rate limit, aguardando ${wait}ms (tentativa ${attempt}/${maxAttempts})`);
        }
        if (attempt < maxAttempts) {
          await sleep(wait);
          delay = Math.floor(delay * mult);
          continue;
        }
        return {
          ok: false,
          status: 429,
          errorKind: "rate_limit",
          message: "Rate limit (429) após retentativas.",
        };
      }

      if (!res.ok) {
        const err = obj.error as { code?: number; message?: string } | undefined;
        return {
          ok: false,
          status: res.status,
          errorKind: "api_error",
          message: err?.message ?? `HTTP ${res.status}`,
          apiError: err ? { code: err.code, message: err.message } : undefined,
        };
      }

      const topError = obj.error as { code?: number; message?: string } | undefined;
      if (topError?.message && !obj.lighthouseResult) {
        return {
          ok: false,
          status: res.status,
          errorKind: "api_error",
          message: topError.message,
          apiError: { code: topError.code, message: topError.message },
        };
      }

      return { ok: true, status: res.status, json: obj as PagespeedApiRawResponse };
    } catch (e) {
      clearTimeout(timer);
      const isAbort =
        e instanceof Error &&
        (e.name === "AbortError" || e.message.includes("aborted"));
      if (isAbort) {
        if (attempt < maxAttempts) {
          if (params.verbose) {
            console.error(`[pagespeed-api] timeout, retentativa ${attempt}/${maxAttempts}`);
          }
          await sleep(delay);
          delay = Math.floor(delay * mult);
          continue;
        }
        return {
          ok: false,
          status: 0,
          errorKind: "timeout",
          message: `Timeout após ${params.timeoutMs}ms`,
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        status: 0,
        errorKind: "network",
        message: msg,
      };
    }
  }

  return {
    ok: false,
    status: 0,
    errorKind: "unknown",
    message: "Falha após retentativas.",
  };
}
