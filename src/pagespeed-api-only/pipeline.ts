import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditConfig } from "../config.js";
import { projectRoot, resolvePagespeedApiOnlyOptions } from "../config.js";
import { runPagespeed } from "./client.js";
import { readCacheFile, requestCacheHash, writeCacheFile } from "./cache.js";
import { normalizeProfileFromResult } from "./normalize.js";
import { buildUrlResult } from "./summary-rules.js";
import type {
  ConsolidatedReport,
  PagespeedApiRawResponse,
  ProfileNorm,
  UrlPagespeedApiResult,
} from "./types.js";

export type PipelineHooks = {
  onPhaseStart: (label: string) => void;
  onPhaseEnd: () => void;
};

export type PipelineOptions = {
  apiKey: string;
  hooks?: PipelineHooks;
};

function resolveCacheDirAbs(cfg: AuditConfig, root: string): string | null {
  const o = resolvePagespeedApiOnlyOptions(cfg);
  const dir = o.cacheDir;
  if (dir === null || dir === undefined) return null;
  if (dir.startsWith("/")) return dir;
  return join(root, dir);
}

function writeRawIfNeeded(
  root: string,
  subdir: string,
  filename: string,
  json: PagespeedApiRawResponse
): string {
  const dir = join(root, "reports", subdir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(json, null, 2), "utf-8");
  return path;
}

async function fetchOrCache(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey: string,
  cfg: AuditConfig,
  cacheDirAbs: string | null,
  root: string,
  opts: ReturnType<typeof resolvePagespeedApiOnlyOptions>,
  saveRaw: boolean,
  rawSubdir: string,
  verbose: boolean
): Promise<{ profile: ProfileNorm; rawPath?: string }> {
  const hash = requestCacheHash({
    url,
    strategy,
    categories: opts.categories,
    locale: opts.locale,
  });
  if (cacheDirAbs) {
    const cached = readCacheFile(cacheDirAbs, hash);
    if (cached) {
      if (verbose) {
        console.error(`[pagespeed-api] cache hit ${hash.slice(0, 8)}… ${strategy} ${url.slice(0, 60)}`);
      }
      const synthetic = { ok: true as const, status: 200, json: cached };
      const prof = normalizeProfileFromResult(synthetic, strategy);
      return { profile: prof };
    }
  }

  const result = await runPagespeed({
    url,
    key: apiKey,
    strategy,
    categories: opts.categories,
    locale: opts.locale,
    timeoutMs: opts.timeoutMs,
    retry: opts.retry,
    verbose,
  });

  let rawPath: string | undefined;
  if (result.ok && saveRaw) {
    rawPath = writeRawIfNeeded(
      root,
      rawSubdir,
      `${hash}-${strategy}.json`,
      result.json
    );
  }

  if (result.ok && cacheDirAbs) {
    writeCacheFile(cacheDirAbs, hash, result.json);
  }

  const profile = normalizeProfileFromResult(result, strategy, rawPath);
  return { profile, rawPath };
}

async function analyzeOneUrl(
  url: string,
  apiKey: string,
  cfg: AuditConfig,
  root: string,
  opts: ReturnType<typeof resolvePagespeedApiOnlyOptions>,
  cacheDirAbs: string | null,
  hooks: PipelineHooks | undefined,
  verbose: boolean
): Promise<UrlPagespeedApiResult> {
  const label = url.length > 64 ? `${url.slice(0, 61)}…` : url;
  hooks?.onPhaseStart(`PageSpeed API mobile+desktop — ${label}`);

  const rawSubdir = opts.rawOutputSubdir ?? "pagespeed-api-raw";
  const [m, d] = await Promise.all([
    fetchOrCache(
      url,
      "mobile",
      apiKey,
      cfg,
      cacheDirAbs,
      root,
      opts,
      opts.saveRawPayload,
      rawSubdir,
      verbose
    ),
    fetchOrCache(
      url,
      "desktop",
      apiKey,
      cfg,
      cacheDirAbs,
      root,
      opts,
      opts.saveRawPayload,
      rawSubdir,
      verbose
    ),
  ]);

  hooks?.onPhaseEnd();

  const requestedAt = new Date().toISOString();
  return buildUrlResult(url, m.profile, d.profile, requestedAt);
}

export async function runPagespeedApiOnlyPipeline(
  urls: string[],
  cfg: AuditConfig,
  options: PipelineOptions
): Promise<ConsolidatedReport> {
  const root = projectRoot();
  const opts = resolvePagespeedApiOnlyOptions(cfg);
  const cacheDirAbs = resolveCacheDirAbs(cfg, root);
  const concurrency = Math.max(1, opts.concurrency);
  const results: UrlPagespeedApiResult[] = new Array(urls.length);
  const batchNotes: string[] = [];

  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= urls.length) return;
      const u = urls[i];
      try {
        results[i] = await analyzeOneUrl(
          u,
          options.apiKey,
          cfg,
          root,
          opts,
          cacheDirAbs,
          options.hooks,
          opts.verbose
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        batchNotes.push(`URL falhou (${u}): ${msg}`);
        const requestedAt = new Date().toISOString();
        const fail = {
          ok: false as const,
          status: 0,
          errorKind: "unknown" as const,
          message: msg,
        };
        results[i] = buildUrlResult(
          u,
          normalizeProfileFromResult(fail, "mobile"),
          normalizeProfileFromResult(fail, "desktop"),
          requestedAt
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: "pagespeed_api_only",
    apiVersion: "v5",
    urls: results,
    batchNotes,
  };
}
